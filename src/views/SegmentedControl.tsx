import "./lb-components.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
}

/** Shared 2+ way toggle (Swipe/List, Revenue/Expenditure) -- design step 1's .seg. */
function SegmentedControl<T extends string>({ options, value, onChange, label, small }: Props<T>) {
  return (
    <div className={small ? "seg sm" : "seg"} role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? "on" : undefined}
          onClick={() => onChange(opt.value)}
          aria-pressed={opt.value === value}
        >
          {opt.icon && <img src={opt.icon} alt="" />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControl;
