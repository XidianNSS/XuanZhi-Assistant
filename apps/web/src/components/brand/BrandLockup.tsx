import { ThunderboltOutlined } from '@ant-design/icons';
import { Typography } from 'antd';

const { Text } = Typography;

type BrandLockupProps = {
  className?: string;
};

export function BrandLockup({ className = 'brand-row' }: BrandLockupProps) {
  return (
    <div className={className}>
      <span className="brand-mark">
        <ThunderboltOutlined />
      </span>
      <div>
        <Text className="brand-name">玄知助手</Text>
        <Text className="brand-subtitle">Web Assistant</Text>
      </div>
    </div>
  );
}
