using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip;

public partial class VideoCallWindow : Window
{
    private readonly RtpVideoSession? _videoSession;
    private readonly DispatcherTimer _durationTimer;
    private DateTimeOffset _startTime;
    private bool _isMicMuted;
    private bool _isCameraMuted;
    private bool _isFullscreen;

    public event EventHandler? EndCallRequested;
    public event EventHandler<bool>? MuteMicRequested;
    public event EventHandler<bool>? ToggleCameraRequested;

    public VideoCallWindow(string callerName, string callerNumber, RtpVideoSession? videoSession = null)
    {
        InitializeComponent();
        _videoSession = videoSession;
        _startTime = DateTimeOffset.Now;

        CallerNameText.Text = string.IsNullOrWhiteSpace(callerName) ? "Remote User" : callerName;
        CallerNumberText.Text = $"Ext: {callerNumber}";

        var initials = GetInitials(callerName);
        ContactInitialsText.Text = initials;
        LargeInitialsText.Text = initials;

        if (_videoSession != null)
        {
            LocalCameraDeviceText.Text = _videoSession.VideoDevice.Name;
            _videoSession.LocalFrameUpdated += VideoSession_LocalFrameUpdated;
            _videoSession.RemoteFrameUpdated += VideoSession_RemoteFrameUpdated;
            _videoSession.CodecChanged += VideoSession_CodecChanged;
            UpdateCodecDisplay(_videoSession.NegotiatedCodec);
        }

        _durationTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _durationTimer.Tick += DurationTimer_Tick;
    }

    private static string GetInitials(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "VC";
        var parts = name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1) return parts[0].Length >= 2 ? parts[0][..2].ToUpperInvariant() : parts[0].ToUpperInvariant();
        return $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[^1][0])}";
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _durationTimer.Start();
        ApplyMuteVisual();
        ApplyCameraVisual();
    }

    private void DurationTimer_Tick(object? sender, EventArgs e)
    {
        var elapsed = DateTimeOffset.Now - _startTime;
        CallDurationText.Text = elapsed.TotalHours >= 1
            ? elapsed.ToString(@"hh\:mm\:ss")
            : elapsed.ToString(@"mm\:ss");
    }

    public void SyncMicrophone(bool muted)
    {
        _isMicMuted = muted;
        ApplyMuteVisual();
    }

    private void VideoSession_LocalFrameUpdated(object? sender, VideoFrameEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            CameraMutedOverlay.Visibility = e.Muted ? Visibility.Visible : Visibility.Collapsed;
        });
    }

    private void VideoSession_RemoteFrameUpdated(object? sender, VideoFrameEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            RemotePlaceholderPanel.Visibility = Visibility.Collapsed;
            StreamQualityLabel.Text = $"Live Video Stream  •  {e.Width}x{e.Height} HD";
        });
    }

    private void VideoSession_CodecChanged(object? sender, string codec)
    {
        Dispatcher.InvokeAsync(() =>
        {
            UpdateCodecDisplay(codec);
        });
    }

    private void UpdateCodecDisplay(string codec)
    {
        YeastarProtocolBadge.Text = $"Yeastar SIP/WebRTC  •  {codec}";
        RemoteCodecInfo.Text = $"Receiving {codec} Stream  •  1280x720 @ 30fps";
    }

    private void MuteMicButton_Click(object sender, RoutedEventArgs e)
    {
        _isMicMuted = !_isMicMuted;
        ApplyMuteVisual();
        MuteMicRequested?.Invoke(this, _isMicMuted);
    }

    private void ApplyMuteVisual()
    {
        if (MuteMicButton.Template.FindName("BtnBdr", MuteMicButton) is System.Windows.Controls.Border bdr &&
            MuteMicButton.Template.FindName("BtnIcon", MuteMicButton) is System.Windows.Controls.TextBlock icon)
        {
            if (_isMicMuted)
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                icon.Text = "\uE74F";
            }
            else
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(31, 41, 55));
                icon.Text = "\uE720";
            }
        }
    }

    private void ToggleCameraButton_Click(object sender, RoutedEventArgs e)
    {
        _isCameraMuted = !_isCameraMuted;
        CameraMutedOverlay.Visibility = _isCameraMuted ? Visibility.Visible : Visibility.Collapsed;
        ApplyCameraVisual();
        ToggleCameraRequested?.Invoke(this, _isCameraMuted);
    }

    private void ApplyCameraVisual()
    {
        if (ToggleCameraButton.Template.FindName("BtnBdr", ToggleCameraButton) is System.Windows.Controls.Border bdr &&
            ToggleCameraButton.Template.FindName("BtnIcon", ToggleCameraButton) is System.Windows.Controls.TextBlock icon)
        {
            if (_isCameraMuted)
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                icon.Text = "\uE715";
            }
            else
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(31, 41, 55));
                icon.Text = "\uE714";
            }
        }
    }

    private void RequestKeyframeButton_Click(object sender, RoutedEventArgs e)
    {
        _videoSession?.SendPictureLossIndication();
        StreamQualityLabel.Text = "Requested Keyframe (Yeastar RTCP PLI)...";
    }

    private void FullscreenButton_Click(object sender, RoutedEventArgs e)
    {
        _isFullscreen = !_isFullscreen;
        if (_isFullscreen)
        {
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
        }
        else
        {
            WindowStyle = WindowStyle.SingleBorderWindow;
            WindowState = WindowState.Normal;
        }
    }

    private void EndCallButton_Click(object sender, RoutedEventArgs e)
    {
        EndCallRequested?.Invoke(this, EventArgs.Empty);
        Close();
    }

    private void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _durationTimer.Stop();
        if (_videoSession != null)
        {
            _videoSession.LocalFrameUpdated -= VideoSession_LocalFrameUpdated;
            _videoSession.RemoteFrameUpdated -= VideoSession_RemoteFrameUpdated;
            _videoSession.CodecChanged -= VideoSession_CodecChanged;
        }
    }
}
