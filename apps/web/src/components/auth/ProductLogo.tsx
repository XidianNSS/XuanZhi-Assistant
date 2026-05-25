import { ThunderboltOutlined } from '@ant-design/icons';

export function ProductLogo() {
  return (
    <div className="product-logo-stage" aria-hidden="true">
      <span className="product-logo-ring product-logo-ring-outer" />
      <span className="product-logo-ring product-logo-ring-middle" />
      <span className="product-logo-scan" />
      <span className="product-logo-core">
        <ThunderboltOutlined />
      </span>
      <span className="product-logo-bar product-logo-bar-a" />
      <span className="product-logo-bar product-logo-bar-b" />
      <span className="product-logo-bar product-logo-bar-c" />
    </div>
  );
}
