import React, { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  id,
  className = '',
  ...rest
}, ref) => {
  const generatedId = useId();
  const selectId = id || (label ? generatedId : undefined);
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={`form-group ${error ? 'has-error' : ''}`}>
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`form-input form-select ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...rest}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="form-error-msg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
