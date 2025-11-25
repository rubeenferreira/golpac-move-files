import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Building2, Search, X, Briefcase } from 'lucide-react';

interface UserManagementProps {
  users: User[];
  companies: string[];
  onAddUser: (user: Omit<User, 'id'>) => void;
  onDeleteUser: (id: string) => void;
  onAddCompany: (name: string) => void;
  onDeleteCompany: (name: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ 
    users, 
    companies, 
    onAddUser, 
    onDeleteUser,
    onAddCompany,
    onDeleteCompany
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'User' as UserRole,
    company: companies[0] || ''
  });

  const [newCompany, setNewCompany] = useState('');

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.username && newUser.password) {
      onAddUser(newUser);
      setIsModalOpen(false);
      setNewUser({
        username: '',
        password: '',
        role: 'User',
        company: companies[0] || ''
      });
    }
  };

  const handleCompanySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if(newCompany.trim()) {
          onAddCompany(newCompany.trim());
          setNewCompany('');
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Shield className="text-brand-600" />
             User Management
           </h2>
           <p className="text-slate-500 text-sm">Create and manage access for admins and support staff.</p>
        </div>
        <div className="flex gap-3">
             <button 
                onClick={() => setIsCompanyModalOpen(true)}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-all"
            >
                <Briefcase size={18} />
                Manage Companies
            </button>
            <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-all active:scale-95"
            >
                <Plus size={18} />
                Create User
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
           <Search size={18} className="text-slate-400" />
           <input 
             type="text" 
             placeholder="Search users or companies..." 
             className="flex-1 text-sm outline-none placeholder:text-slate-400"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Company Access</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                        user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.username}</p>
                        <p className="text-xs text-slate-400">ID: {user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'Admin' 
                        ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 size={14} className="text-slate-400" />
                      {user.company}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onDeleteUser(user.id)}
                      className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                      title="Remove User"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    No users found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Create New User</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Username & Password */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="jdoe"
                    value={newUser.username}
                    onChange={e => setNewUser({...newUser, username: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Temporary password"
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewUser({...newUser, role: 'Admin'})}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      newUser.role === 'Admin' 
                        ? 'bg-purple-50 border-purple-200 text-purple-700 ring-1 ring-purple-200' 
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewUser({...newUser, role: 'User'})}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      newUser.role === 'User' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200' 
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    User
                  </button>
                </div>
              </div>

              {/* Company Selection */}
              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Access Company</label>
                 <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
                      value={newUser.company}
                      onChange={e => setNewUser({...newUser, company: e.target.value})}
                    >
                      {companies.map(company => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                 </div>
                 <p className="text-xs text-slate-400 mt-1">Select the organization this user will support.</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 shadow-sm transition-colors"
                >
                  Create User
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Company Management Modal */}
      {isCompanyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCompanyModalOpen(false)} />
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="text-lg font-bold text-slate-800">Manage Companies</h3>
                      <button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6 flex-1 overflow-y-auto">
                      <form onSubmit={handleCompanySubmit} className="flex gap-2 mb-6">
                          <input 
                              type="text" 
                              placeholder="Add new company..."
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                              value={newCompany}
                              onChange={e => setNewCompany(e.target.value)}
                          />
                          <button type="submit" disabled={!newCompany.trim()} className="bg-slate-800 text-white p-2 rounded-lg disabled:opacity-50">
                              <Plus size={20} />
                          </button>
                      </form>

                      <div className="space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Existing Companies</h4>
                          {companies.map(comp => (
                              <div key={comp} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                                  <span className="font-medium text-slate-700">{comp}</span>
                                  <button 
                                    onClick={() => onDeleteCompany(comp)}
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                      <Trash2 size={16} />
                                  </button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};