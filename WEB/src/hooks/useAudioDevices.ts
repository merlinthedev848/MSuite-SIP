import { useState, useEffect, useCallback } from 'react';
import type { AudioDevice } from '../types';

export function useAudioDevices() {
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([
    { id: 'default', name: 'Default Audio Input' }
  ]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([
    { id: 'default', name: 'Default Audio Output' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return;
      }

      // Prompt for temporary audio permission to reveal device labels
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch {
        // Continue even if permission was denied; fallback to generic device IDs
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          name: d.label || `Microphone (${d.deviceId.slice(0, 4) || 'Default'})`
        }));
      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          id: d.deviceId,
          name: d.label || `Speaker (${d.deviceId.slice(0, 4) || 'Default'})`
        }));

      if (inputs.length > 0) setAudioInputs(inputs);
      if (outputs.length > 0) setAudioOutputs(outputs);
    } catch {
      // Fallback defaults preserved
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Asynchronously trigger initial device scan on mount
    const timeout = setTimeout(() => {
      void refreshDevices();
    }, 0);

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      clearTimeout(timeout);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  return {
    audioInputs,
    audioOutputs,
    isLoadingDevices: isLoading,
    refreshDevices
  };
}
