import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightAction,
  id,
  className = '',
  'aria-describedby': ariaDescribedBy,
  ...rest
}, ref) => {
  const generatedId = useId();
  const inputId = id || (label ? generatedId : undefined);
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId, ariaDescribedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-group ${error ? 'has-error' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      <div className="input-wrapper">
        {leftIcon && <span className="input-icon-left" aria-hidden="true">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`form-input ${leftIcon ? 'with-left-icon' : ''} ${rightAction ? 'with-right-action' : ''} ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        />
        {rightAction && <span className="input-action-right">{rightAction}</span>}
      </div>
      {error ? (
        <p id={errorId} className="form-error-msg" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="form-helper-msg">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';
