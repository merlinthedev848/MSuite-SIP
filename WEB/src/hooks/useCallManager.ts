import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActiveCall, CallRecord } from '../types';

const HISTORY_STORAGE_KEY = 'merlin_sip_history';

export function useCallManager() {
  const [destination, setDestination] = useState('');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>(() => {
    try {
      const cached = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.error('Failed to parse cached call history:', e);
    }
    return [];
  });

  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manage duration interval only while call is connected
  const isConnected = activeCall?.state === 'connected';

  useEffect(() => {
    if (isConnected) {
      callTimerRef.current = setInterval(() => {
        setActiveCall(prev => (prev && prev.state === 'connected' ? { ...prev, duration: prev.duration + 1 } : prev));
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [isConnected]);

  const handleKeyPress = useCallback((num: string) => {
    setDestination(prev => (activeCall ? prev : prev + num));
  }, [activeCall]);

  const handleBackspace = useCallback(() => {
    setDestination(prev => prev.slice(0, -1));
  }, []);

  const makeCall = useCallback((targetNumber?: string) => {
    const dest = (targetNumber || destination).trim();
    if (!dest) return;

    // Simulate standard outbound call progression for web client
    setActiveCall({
      destination: dest,
      state: 'dialing',
      duration: 0,
      muted: false
    });

    // Ringing state after 800ms
    const ringTimeout = setTimeout(() => {
      setActiveCall(prev => (prev && prev.destination === dest ? { ...prev, state: 'ringing' } : prev));
    }, 800);

    // Connected state after 2000ms
    const connectTimeout = setTimeout(() => {
      setActiveCall(prev => (prev && prev.destination === dest ? { ...prev, state: 'connected' } : prev));
    }, 2000);

    return () => {
      clearTimeout(ringTimeout);
      clearTimeout(connectTimeout);
    };
  }, [destination]);

  const hangUp = useCallback(() => {
    if (!activeCall) return;

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    const durationMinSec = `${Math.floor(activeCall.duration / 60)}:${(activeCall.duration % 60).toString().padStart(2, '0')}`;
    const newRecord: CallRecord = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      destination: activeCall.destination,
      type: 'outgoing',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: activeCall.state === 'connected' ? durationMinSec : 'Cancelled'
    };

    setCallHistory(prev => {
      const updated = [newRecord, ...prev].slice(0, 100);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save history to localStorage:', err);
      }
      return updated;
    });

    setActiveCall(null);
  }, [activeCall]);

  const toggleMute = useCallback(() => {
    setActiveCall(prev => (prev ? { ...prev, muted: !prev.muted } : null));
  }, []);

  const toggleHold = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      return {
        ...prev,
        state: prev.state === 'hold' ? 'connected' : 'hold'
      };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setCallHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const resetCalls = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setActiveCall(null);
    setDestination('');
    clearHistory();
  }, [clearHistory]);

  return {
    destination,
    setDestination,
    handleKeyPress,
    handleBackspace,
    activeCall,
    callHistory,
    makeCall,
    hangUp,
    toggleMute,
    toggleHold,
    clearHistory,
    resetCalls
  };
}
