import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './icons';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  block?: boolean;
  danger?: boolean;
  htmlType?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  icon?: ReactNode;
  loading?: boolean;
  shape?: 'circle';
  size?: 'small' | 'middle' | 'large';
  type?: 'default' | 'primary' | 'text' | 'link';
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  block,
  children,
  className,
  danger,
  disabled,
  htmlType = 'button',
  icon,
  loading,
  shape,
  size = 'middle',
  type = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        'ui-button',
        'ant-btn',
        `ui-button-${type}`,
        `ui-button-${size}`,
        block && 'is-block',
        danger && 'is-danger',
        shape === 'circle' && 'is-circle',
        !children && Boolean(icon) && 'is-icon-only',
        className,
      )}
      disabled={disabled || loading}
      type={htmlType}
      {...props}
    >
      {loading ? <Icon name="loader" /> : icon}
      {children}
    </button>
  );
}

export function Badge({ children, className, count, size = 'default' }: {
  children?: ReactNode;
  className?: string;
  count?: number;
  size?: 'small' | 'default';
}) {
  return (
    <span className={cx('ui-badge-wrap', className)}>
      {children}
      {count && count > 0 ? <span className={cx('ui-badge-count', size === 'small' && 'is-small')}>{count}</span> : null}
    </span>
  );
}

export function Tag({ children, className, color, icon }: {
  children?: ReactNode;
  className?: string;
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <span className={cx('ui-tag', 'ant-tag', color && `ui-tag-${color}`, className)}>
      {icon}
      {children}
    </span>
  );
}

type TextProps = HTMLAttributes<HTMLElement> & {
  code?: boolean;
  strong?: boolean;
  type?: 'secondary' | 'danger';
};

export function Text({ children, className, code, strong, type, ...props }: TextProps) {
  if (code) {
    return (
      <code className={cx('ui-code', 'ant-typography', className)} {...props}>
        {children}
      </code>
    );
  }

  const TagName = strong ? 'strong' : 'span';

  return (
    <TagName
      className={cx(
        'ui-text',
        'ant-typography',
        type === 'secondary' && 'ant-typography-secondary',
        type === 'secondary' && 'ui-text-secondary',
        type === 'danger' && 'ui-text-danger',
        className,
      )}
      {...props}
    >
      {children}
    </TagName>
  );
}

export function Paragraph({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx('ui-paragraph', 'ant-typography', className)} {...props}>
      {children}
    </p>
  );
}

function EmptyBase({ className, description }: { className?: string; description?: ReactNode; image?: unknown }) {
  return (
    <div className={cx('ui-empty', className)}>
      <div className="ui-empty-mark" aria-hidden="true" />
      {description ? <span className="ui-empty-description">{description}</span> : null}
    </div>
  );
}

export const Empty = Object.assign(EmptyBase, {
  PRESENTED_IMAGE_SIMPLE: 'simple',
});

export function Space({ children, className, size = 8, wrap }: {
  children?: ReactNode;
  className?: string;
  size?: number;
  wrap?: boolean;
}) {
  return (
    <div className={cx('ui-space', 'ant-space', wrap && 'is-wrap', className)} style={{ gap: size }}>
      {children}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx('ui-divider', className)} role="separator" />;
}

export function Card({ children, className }: { children?: ReactNode; className?: string; size?: 'small' }) {
  return (
    <section className={cx('ui-card', 'ant-card', className)}>
      <div className="ui-card-body ant-card-body">{children}</div>
    </section>
  );
}

export function Alert({ description, message, type = 'info' }: {
  description?: ReactNode;
  message?: ReactNode;
  showIcon?: boolean;
  type?: 'error' | 'info' | 'success' | 'warning';
}) {
  return (
    <div className={cx('ui-alert', 'ant-alert', `ui-alert-${type}`)}>
      <Icon name={type === 'error' ? 'x-circle' : type === 'success' ? 'check-circle' : 'clock'} />
      <div>
        <div className="ui-alert-message ant-alert-message">{message}</div>
        {description ? <div className="ui-alert-description ant-alert-description">{description}</div> : null}
      </div>
    </div>
  );
}

export function Tooltip({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <span className="ui-tooltip" title={typeof title === 'string' ? title : undefined}>
      {children}
    </span>
  );
}

type PopoverPlacement = 'bottom' | 'bottomLeft' | 'bottomRight' | 'top' | 'topLeft' | 'topRight';

type PopoverProps = {
  children: ReactNode;
  content: ReactNode;
  overlayClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopoverPlacement;
  trigger?: 'click' | 'hover' | Array<'click' | 'hover'>;
};

const hiddenPopoverStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 'auto',
  bottom: 'auto',
  visibility: 'hidden',
  transform: 'none',
};

function clampPopoverPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getPopoverPosition(anchorRect: DOMRect, contentRect: DOMRect, placement: PopoverPlacement): CSSProperties {
  const viewportMargin = 8;
  const gap = 8;
  const maxLeft = window.innerWidth - contentRect.width - viewportMargin;
  const maxTop = window.innerHeight - contentRect.height - viewportMargin;
  const top = placement.startsWith('top') ? anchorRect.top - contentRect.height - gap : anchorRect.bottom + gap;

  let left = anchorRect.left + anchorRect.width / 2 - contentRect.width / 2;
  if (placement.endsWith('Left')) {
    left = anchorRect.left;
  } else if (placement.endsWith('Right')) {
    left = anchorRect.right - contentRect.width;
  }

  return {
    position: 'fixed',
    top: clampPopoverPosition(top, viewportMargin, maxTop),
    left: clampPopoverPosition(left, viewportMargin, maxLeft),
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
  };
}

export function Popover({
  children,
  content,
  open,
  onOpenChange,
  overlayClassName,
  placement = 'bottom',
  trigger = 'hover',
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [contentStyle, setContentStyle] = useState<CSSProperties>();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const triggers = Array.isArray(trigger) ? trigger : [trigger];
  const visible = open ?? internalOpen;
  const placementClass = `is-placement-${placement}`;
  const setVisible = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };
  const openByHover = () => {
    if (!triggers.includes('hover')) {
      return;
    }
    clearCloseTimer();
    setVisible(true);
  };
  const closeByHover = () => {
    if (!triggers.includes('hover')) {
      return;
    }
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setVisible(false), 120);
  };

  useLayoutEffect(() => {
    if (!visible) {
      setContentStyle(undefined);
      return undefined;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const popover = contentRef.current;
      if (!anchor || !popover) {
        return;
      }

      setContentStyle(getPopoverPosition(anchor.getBoundingClientRect(), popover.getBoundingClientRect(), placement));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [visible, placement, content]);

  useEffect(() => {
    if (!visible || !triggers.includes('click')) {
      return undefined;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (anchorRef.current?.contains(target) || contentRef.current?.contains(target)) {
        return;
      }

      setVisible(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [visible, triggers]);

  useEffect(() => clearCloseTimer, []);

  const popoverContent = visible ? (
    <span
      ref={contentRef}
      className={cx('ui-popover-content', placementClass, overlayClassName)}
      style={contentStyle ?? hiddenPopoverStyle}
      onMouseEnter={openByHover}
      onMouseLeave={closeByHover}
    >
      <span className="ui-popover-inner ant-popover-inner">{content}</span>
    </span>
  ) : null;

  return (
    <span
      className={cx('ui-popover', visible && 'is-open')}
      onMouseEnter={openByHover}
      onMouseLeave={closeByHover}
    >
      <span
        ref={anchorRef}
        className="ui-popover-anchor"
        onClick={() => triggers.includes('click') && setVisible(!visible)}
        role={triggers.includes('click') ? 'button' : undefined}
      >
        {children}
      </span>
      {popoverContent && typeof document !== 'undefined' ? createPortal(popoverContent, document.body) : null}
    </span>
  );
}

export function Modal({ centered, children, className, footer, onCancel, open, title, width = 420 }: {
  centered?: boolean;
  children?: ReactNode;
  className?: string;
  footer?: ReactNode;
  onCancel?: () => void;
  open?: boolean;
  title?: ReactNode;
  width?: number;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className={cx('ui-modal-root', centered && 'is-centered')} role="dialog" aria-modal="true">
      <button className="ui-modal-backdrop" type="button" aria-label="关闭" onClick={onCancel} />
      <section className={cx('ui-modal-panel', className)} style={{ width }}>
        <div className="ui-modal-header">
          <Text strong>{title}</Text>
          <Button type="text" shape="circle" icon={<Icon name="x" />} aria-label="关闭" onClick={onCancel} />
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer ? <div className="ui-modal-footer">{footer}</div> : null}
      </section>
    </div>
  );
}

export function Tabs({ className, items }: {
  className?: string;
  items: Array<{ children: ReactNode; key: string; label: ReactNode }>;
  size?: 'small';
}) {
  const [activeKey, setActiveKey] = useState(items[0]?.key);
  const activeItem = items.find((item) => item.key === activeKey) ?? items[0];

  return (
    <div className={cx('ui-tabs', 'ant-tabs', className)}>
      <div className="ui-tabs-nav ant-tabs-nav" role="tablist">
        {items.map((item) => (
          <button
            className={cx(
              'ui-tabs-tab',
              'ant-tabs-tab',
              item.key === activeItem?.key && 'ant-tabs-tab-active',
            )}
            key={item.key}
            role="tab"
            type="button"
            aria-selected={item.key === activeItem?.key}
            onClick={() => setActiveKey(item.key)}
          >
            <span className="ant-tabs-tab-btn">{item.label}</span>
          </button>
        ))}
        <span className="ant-tabs-ink-bar" />
      </div>
      <div className="ui-tabs-content-holder ant-tabs-content-holder">
        <div className="ui-tabs-content ant-tabs-content">
          <div className="ui-tabs-tabpane ant-tabs-tabpane" role="tabpanel">
            {activeItem?.children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Avatar({ icon, size = 32 }: { icon?: ReactNode; size?: number }) {
  return (
    <span className="ui-avatar" style={{ width: size, height: size }}>
      {icon}
    </span>
  );
}

export function Checkbox({ children, defaultChecked }: {
  children?: ReactNode;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <label className="ui-checkbox" htmlFor={id}>
      <input id={id} type="checkbox" defaultChecked={defaultChecked} />
      <span>{children}</span>
    </label>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  prefix?: ReactNode;
};

function InputBase({ className, prefix, type = 'text', ...props }: InputProps) {
  return (
    <span className={cx('ui-input-wrap', 'ant-input-affix-wrapper', className)}>
      {prefix ? <span className="ui-input-prefix ant-input-prefix">{prefix}</span> : null}
      <input className="ui-input ant-input" type={type} {...props} />
    </span>
  );
}

export const Input = Object.assign(InputBase, {
  Password: (props: InputProps) => <InputBase type="password" {...props} />,
});

export function Spinner({ size = 'default' }: { size?: 'default' | 'large' }) {
  return <Icon name="loader" className={cx('ui-spinner', size === 'large' && 'is-large')} />;
}

type ToastEvent = CustomEvent<{ content: string; type: 'error' | 'warning' }>;

export const toast = {
  error(content: string) {
    window.dispatchEvent(new CustomEvent('xuanzhi:toast', { detail: { content, type: 'error' } }));
  },
  warning(content: string) {
    window.dispatchEvent(new CustomEvent('xuanzhi:toast', { detail: { content, type: 'warning' } }));
  },
};

export function Toaster() {
  const [items, setItems] = useState<Array<{ id: number; content: string; type: 'error' | 'warning' }>>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const toastEvent = event as ToastEvent;
      const id = Date.now();
      setItems((current) => [...current, { id, ...toastEvent.detail }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 3200);
    };

    window.addEventListener('xuanzhi:toast', onToast);
    return () => window.removeEventListener('xuanzhi:toast', onToast);
  }, []);

  return (
    <div className="ui-toaster">
      {items.map((item) => (
        <div className={cx('ui-toast', `ui-toast-${item.type}`)} key={item.id}>
          {item.content}
        </div>
      ))}
    </div>
  );
}

export type { CSSProperties };
