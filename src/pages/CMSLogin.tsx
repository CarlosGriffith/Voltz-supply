import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCMSAuth } from '@/contexts/CMSAuthContext';
import { Lock, User, Eye, EyeOff, AlertCircle, ArrowLeft, Shield } from 'lucide-react';

const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';

const CMSLogin: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useCMSAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // After login (or if already signed in), go to CMS once auth state is true
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/cms', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    const success = login(username.trim(), password);
    if (success) {
      setLoading(false);
      // Navigation: useEffect below runs when isAuthenticated becomes true (after flushSync in login).
    } else {
      setError('Invalid username or password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1923] via-[#1a2332] to-[#0f1923] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-[#e31e24]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-blue-500/5 rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Back to Home */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 sm:mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to Website</span>
        </button>

        {/* Login Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/10 p-6 sm:p-8 lg:p-10 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <img src={LOGO_URL} alt="Voltz Industrial Supply" className="h-10 sm:h-14 w-auto mx-auto mb-4 sm:mb-6" />

            <div className="inline-flex items-center gap-2 bg-[#e31e24]/10 rounded-full px-4 py-1.5 mb-3 sm:mb-4">
              <Shield className="w-4 h-4 text-[#e31e24]" />
              <span className="text-[#e31e24] text-xs font-bold uppercase tracking-wider">Admin Access</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mb-2">Content Management</h1>
            <p className="text-gray-400 text-xs sm:text-sm">Sign in to manage your website content, products, and sections.</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 sm:mb-6">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-xs sm:text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Username */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-300 mb-2">Username</label>
              <div className="relative">
                <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 sm:pl-12 pr-4 py-3.5 sm:py-3 text-white placeholder-gray-500 outline-none focus:border-[#e31e24]/50 focus:ring-2 focus:ring-[#e31e24]/20 transition-all text-sm"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-gray-300 mb-2">Password</label>
              <div className="relative">
                <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2">
                  <Lock className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 sm:pl-12 pr-12 py-3.5 sm:py-3 text-white placeholder-gray-500 outline-none focus:border-[#e31e24]/50 focus:ring-2 focus:ring-[#e31e24]/20 transition-all text-sm"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#e31e24] to-[#c91a1f] text-white py-3.5 sm:py-3 rounded-xl font-bold text-sm hover:from-[#c91a1f] hover:to-[#a81519] transition-all shadow-lg shadow-red-900/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Sign In to CMS
                </>
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="mt-5 sm:mt-6 pt-5 sm:pt-6 border-t border-white/5">
            <div className="bg-white/5 rounded-xl p-3 sm:p-4">
              <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">Demo Credentials</p>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">
                  Username: <code className="text-[#e31e24] bg-white/5 px-1.5 py-0.5 rounded">admin</code>
                </p>
                <p className="text-xs text-gray-400">
                  Password: <code className="text-[#e31e24] bg-white/5 px-1.5 py-0.5 rounded">admin123</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-5 sm:mt-6">
          &copy; {new Date().getFullYear()} Voltz Industrial Supply. Authorized personnel only.
        </p>
      </div>
    </div>
  );
};

export default CMSLogin;
