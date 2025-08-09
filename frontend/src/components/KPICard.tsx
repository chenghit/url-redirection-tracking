import React from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
  loading?: boolean;
  icon?: React.ReactNode;
}

const colorClasses = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
  red: 'text-red-600',
  yellow: 'text-yellow-600'
};

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  color,
  loading = false,
  icon
}) => {
  const cardId = `kpi-${title.toLowerCase().replace(/\s+/g, '-')}`;
  const valueId = `${cardId}-value`;
  const subtitleId = `${cardId}-subtitle`;

  return (
    <div 
      className="bg-white p-4 sm:p-6 rounded-lg shadow hover:shadow-md transition-shadow"
      role="region"
      aria-labelledby={cardId}
      aria-describedby={`${valueId} ${subtitleId}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 
          id={cardId}
          className="text-base sm:text-lg font-medium text-gray-900 truncate pr-2"
        >
          {title}
        </h3>
        {icon && (
          <div className="text-gray-400 flex-shrink-0" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
      
      <div className="mb-2">
        {loading ? (
          <div className="animate-pulse" aria-label="Loading data">
            <div className="h-6 sm:h-8 bg-gray-200 rounded w-16 sm:w-20"></div>
          </div>
        ) : (
          <p 
            id={valueId}
            className={`text-2xl sm:text-3xl font-bold ${colorClasses[color]} break-all`}
            aria-label={`${title} value: ${typeof value === 'number' ? value.toLocaleString() : value}`}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        )}
      </div>
      
      <p 
        id={subtitleId}
        className="text-xs sm:text-sm text-gray-500"
        aria-label={loading ? 'Loading subtitle' : `Description: ${subtitle}`}
      >
        {loading ? 'Loading...' : subtitle}
      </p>
    </div>
  );
};

export default KPICard;