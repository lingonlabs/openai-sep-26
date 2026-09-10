import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', danger: 'button-danger' }, size: { default: '', small: 'button-small', icon: 'button-icon' } }, defaultVariants: { variant: 'primary', size: 'default' } });
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={twMerge(clsx(variants({ variant, size }), className))} {...props} />);
Button.displayName = 'Button';
