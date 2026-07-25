export function ToggleSwitch({
  checked,
  onChange,
  label,
  sublabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0 border-b border-gray-100 dark:border-gray-800 last:border-none ${disabled ? "opacity-50" : ""}`}
    >
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
        </span>
        {sublabel && (
          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {sublabel}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[22px] w-9 flex-none items-center rounded-full transition-colors ${
          disabled ? "cursor-not-allowed" : ""
        } ${checked ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700"}`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
