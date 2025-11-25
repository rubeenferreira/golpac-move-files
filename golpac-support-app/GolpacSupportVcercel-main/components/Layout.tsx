import React from 'react';
import { ViewState } from '../types';
import { LayoutDashboard, Monitor, LogOut, Settings, Users } from 'lucide-react';

interface LayoutProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  children: React.ReactNode;
  currentUser?: string;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ currentView, onChangeView, children, currentUser, onLogout }) => {
  
  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => onChangeView(view)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        currentView === view 
          ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm border border-brand-100' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={20} className={currentView === view ? 'text-brand-600' : 'text-slate-400'} />
      <span>{label}</span>
    </button>
  );

  const logoUrl = "https://static.wixstatic.com/media/297e13_91fceac09fe745458d11b50051949432~mv2.png/v1/fill/w_194,h_110,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo_footer.png";

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
           <div className="flex items-center gap-3">
             <div className="h-12 px-3 bg-brand-600 rounded-xl flex items-center justify-center shadow-sm overflow-hidden shrink-0">
                <img src={logoUrl} alt="Golpac" className="h-full w-auto object-contain py-2" />
             </div>
             <div className="flex flex-col">
                <span className="text-lg font-bold text-slate-800 leading-none">Support</span>
                <span className="text-brand-600 font-bold text-xs uppercase tracking-wider">IT - Panel</span>
             </div>
           </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem view="devices" icon={Monitor} label="Devices" />
          {/* User management is accessed via the profile card, but could also be here if desired */}
        </nav>

        <div className="p-4 border-t border-slate-100">
           <button 
             onClick={() => onChangeView('users')}
             className={`w-full flex items-center space-x-3 p-3 rounded-lg border transition-all duration-200 text-left ${
               currentView === 'users' 
                 ? 'bg-brand-50 border-brand-200 ring-1 ring-brand-200' 
                 : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-md hover:border-slate-200'
             }`}
           >
             <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
               {currentUser ? currentUser.charAt(0).toUpperCase() : 'A'}
             </div>
             <div className="flex-1 overflow-hidden">
               <p className="text-sm font-medium text-slate-700 truncate">{currentUser || 'Admin User'}</p>
               <p className="text-xs text-slate-400 truncate">Manage Users</p>
             </div>
             <Settings size={16} className="text-slate-400" />
           </button>
           
           <button 
            onClick={onLogout}
            className="mt-2 w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 py-2 rounded-lg transition-colors"
           >
             <LogOut size={14} />
             Sign Out
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between">
           <div className="flex items-center gap-3">
                <div className="h-9 px-2 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
                     <img src={logoUrl} alt="Golpac" className="h-full w-auto object-contain py-1.5" />
                </div>
                <span className="font-bold text-slate-800 text-sm">Golpac Support</span>
           </div>
           <button onClick={() => onChangeView('users')} className="text-slate-500"><Settings /></button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto h-full">
                {children}
            </div>
        </div>
      </main>
    </div>
  );
};