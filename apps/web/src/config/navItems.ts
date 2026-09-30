import { Home, Layers, Mail, UserCog, LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  isFab?: boolean;
}

// Single source of truth for primary navigation — used by both the desktop
// Sidebar and the mobile BottomNav so icon/label changes only happen once.
export const NAV_ITEMS: NavItem[] = [
  { path: '/app/dashboard', label: 'Dashboard', icon: Home },
  { path: '/app/deals', label: 'Deals', icon: Layers },
  { path: '/app/inbox', label: 'Inbox', icon: Mail },
  { path: '/app/settings', label: 'Settings', icon: UserCog },
];