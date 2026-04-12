import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCMSAuth } from '@/contexts/CMSAuthContext';

/**
 * Only mounts children when CMS auth is present — avoids a blank screen from `return null`
 * while waiting for a client-side redirect.
 */
export const RequireCMSAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useCMSAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
