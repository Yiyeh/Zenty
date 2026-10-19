export function ReminderAdvance({
  value,
  onChange,
  label = "Aviso de escritorio",
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label?: string;
}) {
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
          Minutos antes{" "}
          <input
            type="number"
            aria-label={`Antelación: ${label}`}
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
          <small>0 = a la hora indicada</small>
        </label>
      )}
    </div>
  );
}
