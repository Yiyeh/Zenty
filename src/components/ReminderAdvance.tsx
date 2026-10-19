import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
export function ReminderAdvance({
  value,
  onChange,
  label = tr("ReminderAdvance.2b0a031a81"),
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label?: string;
}) {
  useInterfaceLocale();
  return (
    <div className="reminder-advance">
      <label className="check-label">
        <input
          type="checkbox"
          checked={value !== undefined}
          onChange={(event) => onChange(event.target.checked ? 15 : undefined)}
        />
        {label}
      </label>
      {value !== undefined && (
        <label>
          {tr("ReminderAdvance.28ed892f99")}{" "}
          <input
            type="number"
            aria-label={tr("ReminderAdvance.736e4d8d9f", { v0: label })}
            min="0"
            max="10080"
            step="1"
            value={value}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              if (Number.isFinite(minutes))
                onChange(Math.max(0, Math.min(10080, Math.round(minutes))));
            }}
          />
          <small>{tr("ReminderAdvance.c55508ccd9")}</small>
        </label>
      )}
    </div>
  );
}
