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
    Task<SipCallResult> RejectIncomingCallAsync(PendingIncomingCall incoming, bool redirectToVoicemail = false, CancellationToken cancellationToken = default) =>
        Task.FromResult(new SipCallResult(true, redirectToVoicemail ? "Call sent to voicemail." : "Incoming call rejected."));
}

/// <summary>
/// Manages multiple calls, enabling features like Call Waiting and Hold-and-Answer.
/// </summary>
public class CallManager
{
    private readonly ICallManagerSipProvider _sipProvider;
    private readonly object _syncRoot = new();
    private readonly SemaphoreSlim _asyncLock = new(1, 1);

    /// <summary>
    /// Gets the collection of active calls for UI binding.
    /// </summary>
    public ObservableCollection<CallState> ActiveCalls { get; } = new ObservableCollection<CallState>();

    /// <summary>
    /// Event fired when there is a new call waiting.
    /// </summary>
    public event EventHandler<CallWaitingEventArgs>? CallWaiting;

    public CallManager(ICallManagerSipProvider sipProvider)
    {
        _sipProvider = sipProvider ?? throw new ArgumentNullException(nameof(sipProvider));
    }

    /// <summary>
    /// Handles an incoming call when another call is already active.
    /// </summary>
    public async Task HandleIncomingCallAsync(PendingIncomingCall incoming, string callerId)
    {
        var args = new CallWaitingEventArgs(callerId, incoming);
        CallWaiting?.Invoke(this, args);

        switch (args.SelectedAction)
        {
            case CallWaitingAction.HoldAndAnswer:
                await HoldCurrentAndAnswerAsync(incoming);
                break;
            case CallWaitingAction.Reject:
                await _sipProvider.RejectIncomingCallAsync(incoming, redirectToVoicemail: false);
                break;
            case CallWaitingAction.SendToVoicemail:
                await _sipProvider.RejectIncomingCallAsync(incoming, redirectToVoicemail: true);
                break;
        }
    }

    /// <summary>
    /// Removes a finished call from the active calls collection.
    /// </summary>
    public void RemoveCall(string callId)
    {
        lock (_syncRoot)
        {
            var call = ActiveCalls.FirstOrDefault(c => c.CallId == callId);
            if (call != null)
            {
                ActiveCalls.Remove(call);
            }
        }
    }

    /// <summary>
    /// Clears all tracked calls upon SIP deregistration or total call termination.
    /// </summary>
    public void ClearCalls()
    {
        lock (_syncRoot)
        {
            ActiveCalls.Clear();
        }
    }

    /// <summary>
    /// Gets the current active non-held call if any.
    /// </summary>
    public CallState? GetActiveCall()
    {
        lock (_syncRoot)
        {
            return ActiveCalls.FirstOrDefault(c => !c.IsOnHold);
        }
    }

    /// <summary>
    /// Puts the current active call on hold and answers the pending incoming call in an atomic async transaction.
    /// </summary>
    public async Task HoldCurrentAndAnswerAsync(PendingIncomingCall incoming, CancellationToken cancellationToken = default)
    {
        await _asyncLock.WaitAsync(cancellationToken);
        try
        {
            CallState? currentCall;
            lock (_syncRoot)
            {
                currentCall = ActiveCalls.FirstOrDefault(c => !c.IsOnHold);
            }

            if (currentCall != null)
            {
                // Put current call on hold
                var holdResult = await _sipProvider.SetHeldAsync(true, cancellationToken);
                if (holdResult.Signalled)
                {
                    lock (_syncRoot)
                    {
                        currentCall.IsOnHold = true;
                    }
                }
                else
                {
                    throw new InvalidOperationException("Failed to put the current call on hold.");
                }
            }

            // Answer the incoming call
            var answerResult = await _sipProvider.AnswerCallAsync(incoming, cancellationToken);
            if (answerResult.Signalled)
            {
                lock (_syncRoot)
                {
                    ActiveCalls.Add(new CallState
                    {
                        CallId = incoming.CallId,
                        Target = incoming.RemoteTarget,
                        IsOnHold = false,
                        StartTime = DateTime.UtcNow
                    });
                }
            }
            else
            {
                throw new InvalidOperationException("Failed to answer the incoming call.");
            }
        }
        finally
        {
            _asyncLock.Release();
        }
    }

    /// <summary>
    /// Switches to a specific held call, putting the current call on hold if necessary in an atomic async transaction.
    /// </summary>
    public async Task SwitchToHeldCallAsync(string callId, CancellationToken cancellationToken = default)
    {
        await _asyncLock.WaitAsync(cancellationToken);
        try
        {
            CallState? targetCall;
            CallState? currentCall;
            lock (_syncRoot)
            {
                targetCall = ActiveCalls.FirstOrDefault(c => c.CallId == callId);
                currentCall = ActiveCalls.FirstOrDefault(c => !c.IsOnHold);
            }

            if (targetCall == null || !targetCall.IsOnHold)
            {
                return;
            }

            if (currentCall != null)
            {
                var holdResult = await _sipProvider.SetHeldAsync(true, cancellationToken);
                if (!holdResult.Signalled)
                {
                    return;
                }

                lock (_syncRoot)
                {
                    currentCall.IsOnHold = true;
                }
            }

            // Resume the target call
            var resumeResult = await _sipProvider.ResumeSpecificCallAsync(callId, cancellationToken);
            if (resumeResult.Signalled)
            {
                lock (_syncRoot)
                {
                    targetCall.IsOnHold = false;
                }
            }
            else
            {
                throw new InvalidOperationException("Failed to resume the target call.");
            }
        }
        finally
        {
            _asyncLock.Release();
        }
    }
}
