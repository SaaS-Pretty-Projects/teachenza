/**
 * Cloud Functions — arrears ledger writes.
 *
 * The single most important transaction is applyPaymentToStudentBalance().
 * Everything else delegates into it.
 *
 * Billing model: pre-paid credits (v1).
 *   - Students top-up credit balance via SafePay.
 *   - Lessons debit the credit balance.
 *   - Tutors earn gross − commission = net per lesson.
 *
 * See docs/arrears/data-model.md for the full design.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { classifyPaymentState, type Currency } from './money';
import {
  buildInvoiceId,
  createSafepaySession,
  fetchSafepayStatus,
  verifyIpnHash,
} from './payments/safepayServer';
import type {
  ArrearsInvoice,
  AuditEntry,
  PaymentOrder,
  PaymentPurpose,
  StudentBalance,
  TutorEarningEntry,
  TutorEarningsSummary,
} from './arrearsTypes';

// ---------------------------------------------------------------------------
// Environment helpers — read secrets at call-time, never at module load.
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function platformCommissionRate(): number {
  const raw = process.env.PLATFORM_COMMISSION_RATE ?? '0.20';
  const rate = Number.parseFloat(raw);

  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) {
    throw new Error('PLATFORM_COMMISSION_RATE must be a decimal between 0 and 1');
  }

  return rate;
}

// ---------------------------------------------------------------------------
// Callable: createSafepayPaymentSession
// ---------------------------------------------------------------------------

/**
 * Student initiates a credit top-up. Creates a SafePay checkout session and
 * writes a payment_orders/{invoice} doc with status=processing.
 *
 * Mirrors the luxuryui Firebase callable; adapted for Firestore + SafePay.
 */
export async function createSafepayPaymentSession(data: {
  amountMinor: number;
  currency: Currency;
  description: string;
  purpose?: PaymentPurpose;
  invoiceId?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    countryCode: string;
    city: string;
  };
}, context: { auth?: { uid: string } }) {
  if (!context.auth?.uid) throw new Error('Unauthenticated');

  const { customer } = data;
  let { amountMinor, currency, description } = data;
  const purpose: PaymentPurpose = data.purpose ?? 'credit_topup';
  const invoiceId = data.invoiceId?.trim();

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer');
  }
  if (currency !== 'EUR' && currency !== 'GBP') {
    throw new Error('Unsupported currency');
  }
  if (purpose !== 'credit_topup' && purpose !== 'invoice_payment') {
    throw new Error('Unsupported payment purpose');
  }

  if (purpose === 'invoice_payment') {
    if (!invoiceId) {
      throw new Error('invoiceId is required for invoice payments');
    }

    const invoiceSnap = await db.doc(`arrears_invoices/${invoiceId}`).get();
    if (!invoiceSnap.exists) {
      throw new Error('Invoice not found');
    }

    const arrearsInvoice = invoiceSnap.data() as ArrearsInvoice;
    if (arrearsInvoice.studentUid !== context.auth.uid) {
      throw new Error('Forbidden');
    }
    if (arrearsInvoice.status === 'paid' || arrearsInvoice.status === 'written_off') {
      throw new Error('Invoice is already closed');
    }

    amountMinor = arrearsInvoice.amountMinor;
    currency = arrearsInvoice.currency;
    description = `Tutivex invoice payment ${invoiceId}`;
  }

  const merchantId = requireEnv('SAFEPAY_MERCHANT_ID');
  const merchantSecret = requireEnv('SAFEPAY_MERCHANT_SECRET');
  const baseUrl = requireEnv('APP_BASE_URL');
  const safepayApiUrl = requireEnv('SAFEPAY_API_URL');
  const safepayIpnUrl = requireEnv('SAFEPAY_IPN_URL');

  const invoice = buildInvoiceId(context.auth.uid);

  const result = await createSafepaySession({
    invoice,
    amountMinor,
    currency,
    description,
    customer,
    successUrl: `${baseUrl}/checkout/success?invoice=${invoice}`,
    cancelUrl: `${baseUrl}/checkout/cancel?invoice=${invoice}`,
    ipnUrl: safepayIpnUrl,
    merchantId,
    merchantSecret,
    safepayApiUrl,
  });

  if (result.ok === false) {
    throw new Error(`SafePay session creation failed: ${result.error}`);
  }

  // Write the order. merge:false ensures duplicate invoices fail loudly.
  const orderRef = db.doc(`payment_orders/${invoice}`);
  const order: Omit<PaymentOrder, 'creditAppliedAt'> & { creditAppliedAt: null } = {
    invoice,
    studentUid: context.auth.uid,
    providerTransactionId: result.providerTransactionId,
    amountMinor,
    currency,
    purpose,
    ...(purpose === 'invoice_payment' && invoiceId ? {invoiceId} : {}),
    status: 'processing',
    description,
    customer,
    rawCreateResponse: result.rawResponse,
    rawStatusResponse: null,
    providerStatusId: null,
    providerStatusText: null,
    lastCheckedAt: null,
    completedAt: null,
    createdAt: FieldValue.serverTimestamp() as any,
    creditAppliedAt: null,
  };

  await orderRef.set(order, { merge: false });

  return { invoice, checkoutUrl: result.checkoutUrl };
}

// ---------------------------------------------------------------------------
// Callable: refreshSafepayStatus (student-facing poll / fallback)
// ---------------------------------------------------------------------------

/**
 * Poll SafePay for a single invoice's status and apply the result atomically.
 * Idempotent — safe to call multiple times (creditAppliedAt guards double-credit).
 */
export async function refreshSafepayStatus(
  data: { invoice: string },
  context: { auth?: { uid: string } },
) {
  if (!context.auth?.uid) throw new Error('Unauthenticated');

  const { invoice } = data;
  if (!invoice) throw new Error('invoice is required');

  // Verify the invoice belongs to this student before revealing any state.
  const orderSnap = await db.doc(`payment_orders/${invoice}`).get();
  if (!orderSnap.exists) throw new Error('Invoice not found');

  const order = orderSnap.data() as PaymentOrder;
  if (order.studentUid !== context.auth.uid) throw new Error('Forbidden');

  await _pollAndApply(invoice);

  // Re-read to return current status.
  const updated = (await db.doc(`payment_orders/${invoice}`).get()).data() as PaymentOrder;
  return { status: updated.status, creditAppliedAt: updated.creditAppliedAt };
}

// ---------------------------------------------------------------------------
// HTTPS (public): safepayIpn
// ---------------------------------------------------------------------------

/**
 * SafePay IPN webhook — primary state-transition path.
 *
 * Rules:
 *  1. Hash validation FIRST. No payload data is trusted until md5 matches.
 *  2. Always return 200 OK — even for duplicates — so SafePay stops retrying.
 *  3. Delegates to the same applyPaymentToStudentBalance() transaction as
 *     the polling path. Both paths are idempotent and converge on one code path.
 */
export async function safepayIpn(
  req: { body: Record<string, string>; method: string },
  res: { status: (n: number) => { send: (s: string) => void } },
) {
  const { invoice, status_id, hash: receivedHash, payment_system_status } =
    req.body ?? {};

  if (!invoice || !status_id || !receivedHash) {
    return res.status(400).send('Missing fields');
  }

  const merchantId = requireEnv('SAFEPAY_MERCHANT_ID');
  const merchantSecret = requireEnv('SAFEPAY_MERCHANT_SECRET');

  const hashValid = verifyIpnHash(receivedHash, invoice, merchantId, merchantSecret);
  if (!hashValid) {
    // Do NOT reveal which field failed.
    return res.status(403).send('Forbidden');
  }

  const orderRef = db.doc(`payment_orders/${invoice}`);
  const snap = await orderRef.get();
  if (!snap.exists) {
    // Unknown invoice — could be replay. Acknowledge so SafePay stops retrying.
    return res.status(200).send('OK');
  }

  const classified = classifyPaymentState({
    statusId: Number(status_id),
    providerStatusText: String(payment_system_status ?? ''),
  });

  if (classified.shouldCredit) {
    // Mark the order as completed first so applyPaymentToStudentBalance
    // can gate on status === 'completed'.
    await orderRef.update({
      status: 'completed',
      providerStatusId: Number(status_id),
      providerStatusText: String(payment_system_status ?? ''),
      completedAt: FieldValue.serverTimestamp(),
      lastCheckedAt: FieldValue.serverTimestamp(),
    });
    await applyPaymentToStudentBalance(invoice);
  } else if (classified.isTerminal) {
    await orderRef.update({
      status: classified.status,
      providerStatusId: Number(status_id),
      providerStatusText: String(payment_system_status ?? ''),
      lastCheckedAt: FieldValue.serverTimestamp(),
    });
  }

  // Always 200 — duplicates are normal.
  return res.status(200).send('OK');
}

// ---------------------------------------------------------------------------
// Callable: completeLesson
// ---------------------------------------------------------------------------

/**
 * Tutor or admin marks a lesson as completed. Writes an earnings ledger entry
 * atomically and debits the student's credit balance.
 *
 * commissionRate is fixed platform-wide for v1.
 */
export async function completeLesson(
  data: {
    lessonId: string;
    tutorUid: string;
    studentUid: string;
    grossMinor: number;
    currency: Currency;
    lessonCompletedAt: string; // ISO string from client
  },
  context: { auth?: { uid: string }; token?: { admin?: boolean } },
) {
  if (!context.auth?.uid) throw new Error('Unauthenticated');
  // Only tutors/admins may complete lessons.
  if (
    context.auth.uid !== data.tutorUid &&
    !context.token?.admin
  ) {
    throw new Error('Forbidden');
  }

  const COMMISSION_RATE = platformCommissionRate();

  const { lessonId, tutorUid, studentUid, grossMinor, currency, lessonCompletedAt } =
    data;

  if (!Number.isInteger(grossMinor) || grossMinor <= 0) {
    throw new Error('grossMinor must be a positive integer');
  }

  const commissionMinor = Math.round(grossMinor * COMMISSION_RATE);
  const netMinor = grossMinor - commissionMinor;

  const ledgerRef = db.doc(`tutor_earnings_ledger/${lessonId}`);
  const summaryRef = db.doc(`tutor_earnings_summary/${tutorUid}`);
  const balanceRef = db.doc(`student_balances/${studentUid}`);

  await db.runTransaction(async (tx) => {
    // Idempotency: if the ledger entry already exists, this is a redelivery.
    const existing = await tx.get(ledgerRef);
    if (existing.exists) return;

    const balSnap = await tx.get(balanceRef);
    const bal = balSnap.data() as StudentBalance | undefined;
    const cur = currency;
    const prev = bal?.byCurrency?.[cur] ?? { creditsMinor: 0, outstandingMinor: 0 };

    if (prev.creditsMinor < grossMinor) {
      throw new Error(
        `Insufficient credit: student has ${prev.creditsMinor} but lesson costs ${grossMinor}`,
      );
    }

    const entry: TutorEarningEntry = {
      lessonId,
      tutorUid,
      studentUid,
      grossMinor,
      commissionMinor,
      netMinor,
      currency,
      commissionRate: COMMISSION_RATE,
      lessonCompletedAt: new Date(lessonCompletedAt) as any,
      recordedAt: FieldValue.serverTimestamp() as any,
      payoutRequestId: null,
    };

    tx.set(ledgerRef, entry);

    // Debit student credit balance.
    tx.set(
      balanceRef,
      {
        studentUid,
        byCurrency: {
          ...(bal?.byCurrency ?? {}),
          [cur]: {
            creditsMinor: prev.creditsMinor - grossMinor,
            outstandingMinor: prev.outstandingMinor,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
        lastLedgerCursor: lessonId,
      },
      { merge: true },
    );

    // Bump tutor summary (pending bucket until dispute window passes).
    const summarySnap = await tx.get(summaryRef);
    const summary = summarySnap.data() as TutorEarningsSummary | undefined;
    const prevEarnings = summary?.byCurrency?.[cur] ?? {
      pendingMinor: 0,
      availableMinor: 0,
      paidOutMinor: 0,
    };

    tx.set(
      summaryRef,
      {
        tutorUid,
        byCurrency: {
          ...(summary?.byCurrency ?? {}),
          [cur]: {
            ...prevEarnings,
            pendingMinor: prevEarnings.pendingMinor + netMinor,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await _writeAudit({
    actorUid: context.auth.uid,
    action: 'lesson.completed',
    subject: { collection: 'tutor_earnings_ledger', id: lessonId },
    before: null,
    after: { lessonId, grossMinor, netMinor, commissionMinor, currency },
    context: {},
  });
}

// ---------------------------------------------------------------------------
// Core atomic transaction — apply a completed payment to the student balance
// ---------------------------------------------------------------------------

/**
 * The single most important transaction in the arrears system.
 *
 * Safe to call from both the IPN webhook and the polling path — the
 * creditAppliedAt idempotency gate ensures credits are applied exactly once.
 */
export async function applyPaymentToStudentBalance(invoice: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const orderRef = db.doc(`payment_orders/${invoice}`);
    const orderSnap = await tx.get(orderRef);

    if (!orderSnap.exists) {
      throw new Error(`Payment order ${invoice} not found`);
    }

    const order = orderSnap.data() as PaymentOrder;

    // Idempotency gate — second call after success is a no-op.
    if (order.creditAppliedAt) return;
    if (order.status !== 'completed') return;

    const balRef = db.doc(`student_balances/${order.studentUid}`);
    const balSnap = await tx.get(balRef);
    const bal = balSnap.data() as StudentBalance | undefined;
    const cur = order.currency;
    const prev = bal?.byCurrency?.[cur] ?? { creditsMinor: 0, outstandingMinor: 0 };

    if (order.purpose === 'credit_topup') {
      // Add credits to the student's balance.
      tx.set(
        balRef,
        {
          studentUid: order.studentUid,
          byCurrency: {
            ...(bal?.byCurrency ?? {}),
            [cur]: {
              creditsMinor: prev.creditsMinor + order.amountMinor,
              outstandingMinor: prev.outstandingMinor,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
          lastLedgerCursor: order.invoice,
        },
        { merge: true },
      );
    } else if (order.purpose === 'invoice_payment' && order.invoiceId) {
      // Pay off an arrears invoice and reduce outstanding balance.
      const invRef = db.doc(`arrears_invoices/${order.invoiceId}`);
      const invSnap = await tx.get(invRef);

      if (!invSnap.exists) throw new Error(`Invoice ${order.invoiceId} not found`);

      const inv = invSnap.data() as { currency: Currency; status: string };

      if (inv.currency !== order.currency) {
        throw new Error(
          `Currency mismatch — invoice is ${inv.currency}, payment is ${order.currency}`,
        );
      }

      tx.update(invRef, {
        status: 'paid',
        paidAt: FieldValue.serverTimestamp(),
        paymentOrderInvoice: order.invoice,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        balRef,
        {
          studentUid: order.studentUid,
          byCurrency: {
            ...(bal?.byCurrency ?? {}),
            [cur]: {
              creditsMinor: prev.creditsMinor,
              outstandingMinor: Math.max(0, prev.outstandingMinor - order.amountMinor),
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
          lastLedgerCursor: order.invoice,
        },
        { merge: true },
      );
    }

    // Idempotency marker — MUST be the last write so retries see it.
    tx.update(orderRef, { creditAppliedAt: FieldValue.serverTimestamp() });
  });

  // Audit log outside the transaction (eventual consistency is fine for audit).
  await _writeAudit({
    actorUid: 'system',
    action: 'payment.completed',
    subject: { collection: 'payment_orders', id: invoice },
    before: null,
    after: null,
    context: { invoice },
  });
}

// ---------------------------------------------------------------------------
// Internal: poll SafePay and apply result
// ---------------------------------------------------------------------------

async function _pollAndApply(invoice: string): Promise<void> {
  const merchantId = requireEnv('SAFEPAY_MERCHANT_ID');
  const merchantSecret = requireEnv('SAFEPAY_MERCHANT_SECRET');
  const safepayStatusUrl = requireEnv('SAFEPAY_STATUS_URL');

  const result = await fetchSafepayStatus({
    invoice,
    merchantId,
    merchantSecret,
    safepayStatusUrl,
  });

  const orderRef = db.doc(`payment_orders/${invoice}`);

  if (!result.ok) {
    await orderRef.update({ lastCheckedAt: FieldValue.serverTimestamp() });
    return;
  }

  const classified = classifyPaymentState({
    statusId: Number(result.raw.status_id),
    providerStatusText: String(result.raw.payment_system_status ?? ''),
  });

  if (classified.shouldCredit) {
    await orderRef.update({
      status: 'completed',
      providerStatusId: Number(result.raw.status_id),
      providerStatusText: String(result.raw.payment_system_status ?? ''),
      rawStatusResponse: result.raw,
      completedAt: FieldValue.serverTimestamp(),
      lastCheckedAt: FieldValue.serverTimestamp(),
    });
    await applyPaymentToStudentBalance(invoice);
  } else if (classified.isTerminal) {
    await orderRef.update({
      status: classified.status,
      providerStatusId: Number(result.raw.status_id),
      providerStatusText: String(result.raw.payment_system_status ?? ''),
      rawStatusResponse: result.raw,
      lastCheckedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await orderRef.update({
      providerStatusId: Number(result.raw.status_id),
      rawStatusResponse: result.raw,
      lastCheckedAt: FieldValue.serverTimestamp(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal: audit log helper
// ---------------------------------------------------------------------------

async function _writeAudit(
  entry: Omit<AuditEntry, 'at'>,
): Promise<void> {
  await db.collection('audit_log').add({
    ...entry,
    at: FieldValue.serverTimestamp(),
  });
}
