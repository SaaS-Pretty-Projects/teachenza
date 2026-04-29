import {Monitor, Moon, Sun} from 'lucide-react';
import {useTheme, type ThemeMode} from '../lib/theme';

const MODE_META: Record<ThemeMode, {label: string; Icon: typeof Monitor}> = {
  system: {label: 'System', Icon: Monitor},
  dark: {label: 'Dark', Icon: Moon},
  light: {label: 'Bright', Icon: Sun},
};

export default function ThemeToggle({compact = false}: {compact?: boolean}) {
  const {mode, cycleMode, resolvedTheme} = useTheme();
  const {label, Icon} = MODE_META[mode];
  const isLight = resolvedTheme === 'light';
  const nextLabel = mode === 'light' ? 'Dark' : mode === 'dark' ? 'System' : 'Bright';

  return (
    <button
      type="button"
      onClick={cycleMode}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors inline-flex items-center gap-2 shadow-sm ${
        isLight
          ? 'border-black/18 bg-[#111319] text-[#fff] hover:bg-black hover:text-[#fff]'
          : 'border-white/18 bg-white/10 text-white hover:bg-white/16 hover:border-white/30'
      }`}
      aria-label={`Theme: ${label}. Click to switch to ${nextLabel}.`}
      title={`Theme: ${label}. Next: ${nextLabel}`}
    >
      <Icon className="w-4 h-4" />
      {compact ? <span className="hidden sm:inline">{label}</span> : <span>{label}</span>}
    </button>
  );
}
