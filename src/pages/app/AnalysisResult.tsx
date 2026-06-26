import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function AnalysisResult() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/app/dashboard', { replace: true }); }, [navigate]);
  return null;
}