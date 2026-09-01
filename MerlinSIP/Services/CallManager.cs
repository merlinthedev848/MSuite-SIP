namespace MerlinSip.Services;

using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MerlinSip.Models;

/// <summary>
/// Interface for SIP operations required by the Call Manager.
/// </summary>
public interface ICallManagerSipProvider
{
    Task<SipCallResult> SetHeldAsync(bool held, CancellationToken cancellationToken = default);
    Task<SipCallResult> AnswerCallAsync(PendingIncomingCall incoming, CancellationToken cancellationToken = default);
    Task<SipCallResult> ResumeSpecificCallAsync(string callId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Serializes multi-call state transitions so hold/answer/resume operations cannot
/// interleave and leave the UI model in a state that differs from the requested action.
/// The SIP provider still owns the authoritative dialog state.
/// </summary>
public sealed class CallManager : IDisposable
{
    private readonly ICallManagerSipProvider _sipProvider;
    private readonly SemaphoreSlim _transitionLock = new(1, 1);
    private bool _disposed;

    public ObservableCollection<CallState> ActiveCalls { get; } = [];

    public event EventHandler<CallWaitingEventArgs>? CallWaiting;

    public CallManager(ICallManagerSipProvider sipProvider)
    {
        _sipProvider = sipProvider ?? throw new ArgumentNullException(nameof(sipProvider));
    }

    public async Task HandleIncomingCallAsync(PendingIncomingCall incoming, string callerId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(incoming);
        ObjectDisposedException.ThrowIf(_disposed, this);

        var args = new CallWaitingEventArgs(callerId, incoming);
        CallWaiting?.Invoke(this, args);

        switch (args.SelectedAction)
        {
            case CallWaitingAction.HoldAndAnswer:
                await HoldCurrentAndAnswerAsync(incoming, cancellationToken);
                break;
            case CallWaitingAction.Reject:
            case CallWaitingAction.SendToVoicemail:
                // The SIP provider must perform these actions. Do not mutate ActiveCalls
                // because no signalling operation has succeeded here.
                break;
        }
    }

    public async Task HoldCurrentAndAnswerAsync(PendingIncomingCall incoming, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(incoming);
        ObjectDisposedException.ThrowIf(_disposed, this);

        await _transitionLock.WaitAsync(cancellationToken);
        try
        {
            var currentCall = ActiveCalls.FirstOrDefault(c => !c.IsOnHold);
            var currentCallWasHeld = false;

            if (currentCall is not null)
            {
                var holdResult = await _sipProvider.SetHeldAsync(true, cancellationToken);
                if (!holdResult.Signalled)
                {
                    throw new InvalidOperationException($"Failed to put call {currentCall.CallId} on hold: {holdResult.Message}");
                }

                currentCall.IsOnHold = true;
                currentCallWasHeld = true;
            }

            try
            {
                var answerResult = await _sipProvider.AnswerCallAsync(incoming, cancellationToken);
                if (!answerResult.Signalled)
                {
                    throw new InvalidOperationException($"Failed to answer incoming call {incoming.CallId}: {answerResult.Message}");
                }

                RemoveDuplicateCall(incoming.CallId);
                ActiveCalls.Add(new CallState
                {
                    CallId = incoming.CallId,
                    Target = incoming.RemoteTarget,
                    IsOnHold = false,
                    StartTime = DateTime.UtcNow
                });
            }
            catch
            {
                // If answering failed after we successfully held the original call,
                // make a best-effort attempt to restore it. Never claim local state is
                // active when the provider rejected the recovery operation.
                if (currentCallWasHeld && currentCall is not null)
                {
                    try
                    {
                        var resumeResult = await _sipProvider.ResumeSpecificCallAsync(currentCall.CallId, cancellationToken);
                        if (resumeResult.Signalled)
                        {
                            currentCall.IsOnHold = false;
                        }
                    }
                    catch (Exception recoveryError)
                    {
                        DebugLog.Write($"CALL MANAGER recovery failed callId={currentCall.CallId} error={recoveryError.Message}");
                    }
                }

                throw;
            }
        }
        finally
        {
            _transitionLock.Release();
        }
    }

    public async Task SwitchToHeldCallAsync(string callId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(callId))
        {
            throw new ArgumentException("Call ID is required.", nameof(callId));
        }

        ObjectDisposedException.ThrowIf(_disposed, this);
        await _transitionLock.WaitAsync(cancellationToken);
        try
        {
            var targetCall = ActiveCalls.FirstOrDefault(c => c.CallId == callId);
            if (targetCall is null || !targetCall.IsOnHold)
            {
                return;
            }

            var currentCall = ActiveCalls.FirstOrDefault(c => !c.IsOnHold && c.CallId != callId);
            if (currentCall is not null)
            {
                var holdResult = await _sipProvider.SetHeldAsync(true, cancellationToken);
                if (!holdResult.Signalled)
                {
                    throw new InvalidOperationException($"Failed to put call {currentCall.CallId} on hold: {holdResult.Message}");
                }

                currentCall.IsOnHold = true;
            }

            var resumeResult = await _sipProvider.ResumeSpecificCallAsync(callId, cancellationToken);
            if (!resumeResult.Signalled)
            {
                // The current call was already successfully held. Try to restore it so
                // the local model does not silently lose the previously active call.
                if (currentCall is not null)
                {
                    try
                    {
                        var recovery = await _sipProvider.ResumeSpecificCallAsync(currentCall.CallId, cancellationToken);
                        if (recovery.Signalled)
                        {
                            currentCall.IsOnHold = false;
                        }
                    }
                    catch (Exception recoveryError)
                    {
                        DebugLog.Write($"CALL MANAGER switch recovery failed callId={currentCall.CallId} error={recoveryError.Message}");
                    }
                }

                throw new InvalidOperationException($"Failed to resume call {callId}: {resumeResult.Message}");
            }

            targetCall.IsOnHold = false;
        }
        finally
        {
            _transitionLock.Release();
        }
    }

    private void RemoveDuplicateCall(string callId)
    {
        for (var index = ActiveCalls.Count - 1; index >= 0; index--)
        {
            if (string.Equals(ActiveCalls[index].CallId, callId, StringComparison.Ordinal))
            {
                ActiveCalls.RemoveAt(index);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _transitionLock.Dispose();
        GC.SuppressFinalize(this);
    }
}
