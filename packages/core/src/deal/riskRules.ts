import {
  DealStatus,
  CallStatus,
  DEAL_STATUS_COLORS,
  CALL_STATUS_COLORS,
  RiskLevel,
} from '../types';

export function getCallStatusColor(status: string): string {
  return CALL_STATUS_COLORS[status as CallStatus] || DEAL_STATUS_COLORS.Unknown;
}

export function getCallStatusStyle(status: string): {
  color: string;
  backgroundColor: string;
  borderColor: string;
} {
  const color = getCallStatusColor(status);
  return {
    color,
    backgroundColor: `${color}1A`, // ~10% opacity fill
    borderColor: `${color}4D`,     // ~30% opacity border
  };
}

export function getStatusColor(status: string): string {
  if (status in CALL_STATUS_COLORS) {
    return CALL_STATUS_COLORS[status as CallStatus];
  }
  return DEAL_STATUS_COLORS[status as DealStatus] || DEAL_STATUS_COLORS.Unknown;
}

export function getStatusStyle(status: string): {
  color: string;
  backgroundColor: string;
  borderColor: string;
} {
  const color = getStatusColor(status);
  return {
    color,
    backgroundColor: `${color}1A`, // ~10% opacity fill
    borderColor: `${color}4D`,     // ~30% opacity border
  };
}

export function getRiskLevel(status: string): RiskLevel {
  switch (status as DealStatus) {
    case 'Critical':
    case 'At Risk':
      return 'high';
    case 'Stalled':
    case 'Recovering':
      return 'medium';
    case 'Healthy':
    case 'Promising':
    case 'Won':
      return 'low';
    case 'Lost':
    case 'Unknown':
    default:
      return 'none';
  }
}
