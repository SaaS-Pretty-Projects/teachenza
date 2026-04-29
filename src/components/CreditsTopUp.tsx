import {useEffect, useMemo, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {collection, doc, getDoc, getDocs, limit, query, where} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {ArrowLeft, CheckCircle2, CreditCard, FileText, Loader2, ReceiptText, RefreshCw, ShieldCheck} from 'lucide-react';
import {auth, db, functions} from '../lib/firebase';
import {amountMajorToMinor, formatMinorAmount, type Currency} from '../lib/money';
import type {ArrearsInvoice, PaymentOrder, PaymentPurpose, StudentBalance} from '../lib/arrearsTypes';

const TOP_UP_AMOUNTS = [25, 50, 100, 250];

type CheckoutStatus = 'idle' | 'creating' | 'checking' | 'processing' | 'completed' | 'failed';

interface CreatePaymentSessionResponse {
  invoice: string;
  checkoutUrl: string;
}

interface CreatePaymentSessionRequest {
  amountMinor: number;
  currency: Currency;
  description: string;
  purpose: PaymentPurpose;
  invoiceId?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    countryCode: string;
    city: string;
  };
}

interface RefreshStatusResponse {
  status: 'processing' | 'completed' | 'failed' | 'manual_review';
  creditAppliedAt: unknown | null;
}

function splitName(displayName: string | null | undefined) {
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Tutivex',
    lastName: parts.slice(1).join(' ') || 'Learner',
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as {toDate: () => Date}).toDate();
  }
  return null;
}

function formatDate(value: unknown) {
  const date = toDate(value);
  if (!date) return 'Not set';
  return new Intl.DateTimeFormat('en', {month: 'short', day: 'numeric', year: 'numeric'}).format(date);
}

export default function CreditsTopUp() {
  const location = useLocation();
  const user = auth.currentUser;
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnedInvoice = query.get('invoice') || sessionStorage.getItem('tutivex.pendingSafepayInvoice') || '';
  const returnedFromCheckout = location.pathname.startsWith('/checkout/');
  const initialCurrency = query.get('currency') === 'GBP' ? 'GBP' : 'EUR';
  const defaultName = splitName(user?.displayName);

  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [amountMajor, setAmountMajor] = useState(50);
  const [balance, setBalance] = useState<StudentBalance | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [openInvoices, setOpenInvoices] = useState<ArrearsInvoice[]>([]);
  const [invoice, setInvoice] = useState(returnedInvoice);
  const [status, setStatus] = useState<CheckoutStatus>(returnedFromCheckout ? 'checking' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [customer, setCustomer] = useState({
    firstName: defaultName.firstName,
    lastName: defaultName.lastName,
    email: user?.email || '',
    phone: '',
    countryCode: 'GB',
    city: '',
  });

  const refreshInvoiceStatus = async (invoiceToRefresh: string) => {
    const refreshStatus = httpsCallable<{invoice: string}, RefreshStatusResponse>(functions, 'refreshSafepayStatus');

    setStatus('checking');
    setMessage('Checking SafePay status and applying the payment when it is complete.');

    try {
      const result = await refreshStatus({invoice: invoiceToRefresh});

      if (result.data.status === 'completed' && result.data.creditAppliedAt) {
        sessionStorage.removeItem('tutivex.pendingSafepayInvoice');
        setStatus('completed');
        setMessage('Payment confirmed. The backend ledger has applied the settled SafePay payment.');
        return 'completed';
      }

      if (result.data.status === 'failed' || result.data.status === 'manual_review') {
        setStatus('failed');
        setMessage(
          result.data.status === 'manual_review'
            ? 'SafePay returned an ambiguous status. The payment has been held for manual review.'
            : 'SafePay marked this payment as failed.',
        );
        return result.data.status;
      }

      setStatus('processing');
      setMessage('SafePay is still processing this payment. This page will keep checking briefly.');
      return 'processing';
    } catch (error) {
      console.error('SafePay status refresh failed', error);
      setStatus('failed');
      setMessage('Could not refresh payment status. Try again in a moment.');
      return 'failed';
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    async function loadMoneySnapshot() {
      try {
        const [balanceSnapshot, ordersSnapshot, invoicesSnapshot] = await Promise.all([
          getDoc(doc(db, 'student_balances', user.uid)),
          getDocs(query(collection(db, 'payment_orders'), where('studentUid', '==', user.uid), limit(25))),
          getDocs(query(collection(db, 'arrears_invoices'), where('studentUid', '==', user.uid), limit(25))),
        ]);

        const nextOrders = ordersSnapshot.docs
          .map((snapshot) => {
            const data = snapshot.data() as Omit<PaymentOrder, 'invoice'>;
            return {...data, invoice: snapshot.id} as PaymentOrder;
          })
          .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
        const nextInvoices = invoicesSnapshot.docs
          .map((snapshot) => {
            const data = snapshot.data() as Omit<ArrearsInvoice, 'id'>;
            return {...data, id: snapshot.id} as ArrearsInvoice;
          })
          .filter((nextInvoice) => nextInvoice.status !== 'paid' && nextInvoice.status !== 'written_off')
          .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? 0) - (toDate(b.dueDate)?.getTime() ?? 0));

        setPaymentOrders(nextOrders);
        setOpenInvoices(nextInvoices);

        const snapshot = balanceSnapshot;
        if (snapshot.exists()) {
          setBalance(snapshot.data() as StudentBalance);
        }
      } catch (error) {
        console.error('Failed to load money snapshot', error);
      }
    }

    loadMoneySnapshot();
  }, [user]);

  useEffect(() => {
    if (!returnedFromCheckout || !invoice) {
      return;
    }

    let cancelled = false;
    async function poll() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const nextStatus = await refreshInvoiceStatus(invoice);
        if (cancelled || nextStatus !== 'processing') {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    poll();

    return () => {
      cancelled = true;
    };
  }, [invoice, returnedFromCheckout]);

  const selectedMinorAmount = amountMajorToMinor(amountMajor, currency);
  const balanceForCurrency = balance?.byCurrency?.[currency];

  const startTopUp = async () => {
    if (!user || status === 'creating') {
      return;
    }

    if (!customer.email || !customer.phone || !customer.countryCode || !customer.city) {
      setStatus('failed');
      setMessage('Add email, phone, country code, and city before opening SafePay checkout.');
      return;
    }

    try {
      setStatus('creating');
      setMessage('Creating a signed SafePay checkout session.');

      const createSession = httpsCallable<CreatePaymentSessionRequest, CreatePaymentSessionResponse>(
        functions,
        'createSafepayPaymentSession',
      );

      const result = await createSession({
        amountMinor: selectedMinorAmount,
        currency,
        description: `${formatMinorAmount(selectedMinorAmount, currency)} Tutivex credit top-up`,
        purpose: 'credit_topup',
        customer,
      });

      sessionStorage.setItem('tutivex.pendingSafepayInvoice', result.data.invoice);
      window.location.assign(result.data.checkoutUrl);
    } catch (error) {
      console.error('SafePay checkout creation failed', error);
      setStatus('failed');
      setMessage('SafePay checkout could not be created. Check the payment connection and try again.');
    }
  };

  const startInvoicePayment = async (arrearsInvoice: ArrearsInvoice) => {
    if (!user || status === 'creating') {
      return;
    }

    if (!customer.email || !customer.phone || !customer.countryCode || !customer.city) {
      setStatus('failed');
      setMessage('Add email, phone, country code, and city before opening SafePay checkout.');
      return;
    }

    try {
      setStatus('creating');
      setMessage(`Creating a signed SafePay checkout session for invoice ${arrearsInvoice.id}.`);

      const createSession = httpsCallable<CreatePaymentSessionRequest, CreatePaymentSessionResponse>(
        functions,
        'createSafepayPaymentSession',
      );

      const result = await createSession({
        amountMinor: arrearsInvoice.amountMinor,
        currency: arrearsInvoice.currency,
        description: `Tutivex invoice payment ${arrearsInvoice.id}`,
        purpose: 'invoice_payment',
        invoiceId: arrearsInvoice.id,
        customer,
      });

      sessionStorage.setItem('tutivex.pendingSafepayInvoice', result.data.invoice);
      window.location.assign(result.data.checkoutUrl);
    } catch (error) {
      console.error('SafePay invoice checkout creation failed', error);
      setStatus('failed');
      setMessage('SafePay invoice checkout could not be created. Check the payment connection and try again.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-white/55 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/45">Credits</span>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr,0.9fr] gap-6">
        <div className="liquid-glass rounded-[2rem] p-7 md:p-9 border border-white/10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/40 mb-4">Credit top-up</p>
          <h2 className="text-3xl md:text-5xl font-serif tracking-tight mb-4">Add lesson credits with SafePay</h2>
          <p className="max-w-2xl text-white/62 leading-relaxed mb-8">
            Credits are added only after SafePay confirms the payment through the secured backend ledger.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {(['EUR', 'GBP'] as Currency[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCurrency(option)}
                className={`rounded-2xl border px-5 py-4 text-left transition-colors ${
                  currency === option
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] border-white/10 text-white hover:border-white/25'
                }`}
              >
                <span className="text-sm font-medium">{option}</span>
                <span className={`block text-xs mt-1 ${currency === option ? 'text-black/55' : 'text-white/45'}`}>
                  Current credit: {formatMinorAmount(balance?.byCurrency?.[option]?.creditsMinor ?? 0, option)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {TOP_UP_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setAmountMajor(amount)}
                className={`rounded-2xl px-4 py-4 text-sm font-medium border transition-colors ${
                  amountMajor === amount
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] border-white/10 text-white hover:border-white/25'
                }`}
              >
                {formatMinorAmount(amountMajorToMinor(amount, currency), currency)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ['firstName', 'First name'],
              ['lastName', 'Last name'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['countryCode', 'Country code'],
              ['city', 'City'],
            ].map(([field, label]) => (
              <label key={field} className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</span>
                <input
                  value={customer[field as keyof typeof customer]}
                  onChange={(event) => setCustomer((current) => ({...current, [field]: event.target.value}))}
                  className="mt-2 w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/25"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={startTopUp}
            disabled={status === 'creating'}
            className="mt-8 bg-white text-black rounded-full px-5 py-3 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
          >
            {status === 'creating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Pay {formatMinorAmount(selectedMinorAmount, currency)} with SafePay
          </button>
        </div>

        <div className="space-y-6">
          <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
            <div className="flex items-center gap-3 text-white/50 mb-4">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-xs uppercase tracking-[0.24em]">Ledger status</span>
            </div>
            <p className="text-4xl font-serif mb-2">{formatMinorAmount(balanceForCurrency?.creditsMinor ?? 0, currency)}</p>
            <p className="text-sm text-white/45">Available {currency} credit before this top-up.</p>
          </div>

          <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-3">Payment state</p>
            <h3 className="text-2xl font-serif mb-4">
              {status === 'completed' ? 'Credits applied' : status === 'failed' ? 'Needs attention' : 'SafePay ready'}
            </h3>
            <p className="text-white/62 leading-relaxed mb-5">
              {message || 'Choose an amount, confirm your payment details, and continue to hosted checkout.'}
            </p>
            {invoice ? (
              <p className="text-xs text-white/40 break-all mb-5">Invoice: {invoice}</p>
            ) : null}
            {invoice && status !== 'creating' ? (
              <button
                type="button"
                onClick={() => refreshInvoiceStatus(invoice)}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border border-white/15 text-white/75 hover:text-white hover:border-white/30 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh status
              </button>
            ) : null}
            {status === 'completed' ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Payment settled through the backend ledger.
              </div>
            ) : null}
          </div>

          <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
            <div className="flex items-center gap-3 text-white/50 mb-4">
              <FileText className="w-5 h-5" />
              <span className="text-xs uppercase tracking-[0.24em]">Open invoices</span>
            </div>
            {openInvoices.length === 0 ? (
              <p className="text-sm text-white/45">No open invoices are attached to this account.</p>
            ) : (
              <div className="space-y-3">
                {openInvoices.map((openInvoice) => (
                  <div key={openInvoice.id} className="rounded-2xl bg-white/[0.03] border border-white/8 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{formatMinorAmount(openInvoice.amountMinor, openInvoice.currency)}</p>
                        <p className="text-xs text-white/40 mt-1">Due {formatDate(openInvoice.dueDate)} · {openInvoice.status}</p>
                        <p className="text-xs text-white/35 mt-1 break-all">{openInvoice.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startInvoicePayment(openInvoice)}
                        disabled={status === 'creating'}
                        className="shrink-0 rounded-full bg-white text-black px-4 py-2 text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-60"
                      >
                        Pay
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="liquid-glass rounded-[2rem] p-7 border border-white/8">
        <div className="flex items-center gap-3 text-white/50 mb-5">
          <ReceiptText className="w-5 h-5" />
          <span className="text-xs uppercase tracking-[0.24em]">Recent SafePay orders</span>
        </div>
        {paymentOrders.length === 0 ? (
          <p className="text-sm text-white/45">No payment orders have been created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-white/40">
                <tr>
                  <th scope="col" className="py-3 pr-4 font-medium">Invoice</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Purpose</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Amount</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 text-white/70">
                {paymentOrders.map((order) => (
                  <tr key={order.invoice}>
                    <th scope="row" className="py-4 pr-4 text-white/75 font-medium break-all">{order.invoice}</th>
                    <td className="py-4 pr-4">{order.purpose === 'invoice_payment' ? 'Invoice payment' : 'Credit top-up'}</td>
                    <td className="py-4 pr-4">{formatMinorAmount(order.amountMinor, order.currency)}</td>
                    <td className="py-4 pr-4 capitalize">{order.status.replace('_', ' ')}</td>
                    <td className="py-4">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
