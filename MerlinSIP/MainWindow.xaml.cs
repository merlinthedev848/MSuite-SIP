using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MerlinSip.Models;
using MerlinSip.Services;
using MerlinSip.ViewModels;
using DrawingIcon = System.Drawing.Icon;
using DrawingSystemIcons = System.Drawing.SystemIcons;
using WinForms = System.Windows.Forms;
using WpfBrush = System.Windows.Media.Brush;
using WpfBrushes = System.Windows.Media.Brushes;
using WpfColor = System.Windows.Media.Color;
using WpfButton = System.Windows.Controls.Button;
using WpfListBox = System.Windows.Controls.ListBox;

namespace MerlinSip;

public partial class MainWindow : Window
{
    private readonly ContactStore _contactStore = new();
    private readonly CallHistoryStore _callHistoryStore = new();
    private readonly ChatMessageStore _chatMessageStore = new();
    private readonly ChatConnectorService _chatService = new();
    private readonly AppCacheService _cacheService = new();
    private readonly DeviceDiscoveryService _deviceDiscoveryService = new();
    private readonly SipRegistrationService _sipRegistrationService = new();
    private readonly LicenseService _licenseService = new();
    private readonly RingtonePlayer _ringtonePlayer = new();
    private readonly RingtonePlayer _secondaryRingtonePlayer = new();
    private readonly UpdateService _updateService = new();
    private readonly ProvisioningService _provisioningService = new();
    private readonly SipsorceryCompatibilityService _sipsorceryCompatibilityService = new();
    private readonly MainWindowViewModel _viewModel = new();
    private WinForms.NotifyIcon? _trayIcon;
    private readonly ObservableCollection<ContactEntry> _contacts = [];
    private readonly ObservableCollection<CallHistoryEntry> _callHistory = [];
    private readonly ObservableCollection<ChatMessageEntry> _chatMessages = [];
    private readonly ObservableCollection<ChatMessageEntry> _chatThreadMessages = [];
    private readonly ObservableCollection<ContactEntry> _filteredDirectoryContacts = [];
    private readonly ObservableCollection<ContactEntry> _filteredDirectoryFavorites = [];
    private readonly ObservableCollection<ContactEntry> _filteredPhonebookContacts = [];
    private readonly ObservableCollection<ContactEntry> _filteredChatContacts = [];
    private readonly ObservableCollection<CallHistoryEntry> _filteredRecentCalls = [];
    private readonly ObservableCollection<CallHistoryEntry> _filteredCallHistory = [];
    private readonly DispatcherTimer _callTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private DispatcherTimer? _settingsSavedBannerTimer;
    private DispatcherTimer? _queueFlashTimer;
    private DispatcherTimer? _voicemailFlashTimer;
    private bool _voicemailFlashToggle = false;
    private bool _hasVoicemailWaiting = false;
    private VideoCallWindow? _videoCallWindow;
    private bool _currentCallIsVideo;
    private bool _incomingCallIsVideo;
    private bool _queueIsRinging = false;
    private bool _queueFlashToggle = false;
    private readonly DispatcherTimer _connectionWatchdog = new() { Interval = TimeSpan.FromSeconds(15) };
    private readonly DispatcherTimer _licenseWatchdog = new() { Interval = TimeSpan.FromHours(6) };
    private readonly DispatcherTimer _remoteConfigSyncTimer = new() { Interval = TimeSpan.FromMinutes(10) };
    private CancellationTokenSource? _earlyMediaRingbackCancellation;
    private CancellationTokenSource? _incomingNoAnswerCancellation;
    private bool _connectionCheckInProgress;
    private bool _licenseCheckInProgress;
    private bool _licenseLocked;
    private bool _startupUpdateCheckCompleted;
    private AppStartupConfig _config;
    private DateTimeOffset? _activeCallStartedAt;
    private DateTimeOffset? _activeCallConnectedAt;
    private string _activeCallDirection = "Outbound";
    private bool _dndEnabled;
    private bool _muted;
    private bool _held;
    private bool _registered;
    private bool _callInProgress;
    private bool _callConnected;
    private bool _incomingRinging;
    private bool _localRingbackActive;
    private bool _allowExit;
    private bool _networkDiagnosticsRunning;
    private int _callFinishing;
    private string _lastDialedNumber = "";
    private NetworkEngine? _activeNetworkDiagnostics;

    private sealed class LineAppearance
    {
        public int LineNumber { get; set; } = 1;
        public string Status { get; set; } = "Idle";
        public string RemoteNumber { get; set; } = "";
        public string RemoteName { get; set; } = "";
        public string Direction { get; set; } = "Outbound";
        public DateTimeOffset? ConnectedAt { get; set; }
        public bool IsHeld { get; set; }

        public bool HasCall => Status != "Idle";
    }

    private readonly LineAppearance _line1 = new() { LineNumber = 1 };
    private readonly LineAppearance _line2 = new() { LineNumber = 2 };
    private int _selectedLine = 1;
    private readonly List<string> _networkDiagnosticsProgress = [];
    private string _selectedChatNumber = "";
    private string _activeRemoteNumber = "";
    private string _userSelectedPresence = "Available";
    private bool _passwordRevealed;
    private bool _testTonePlaying;
    private DateTimeOffset _lastSettingsSavedAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastPresenceSubscribe = DateTimeOffset.MinValue;
    private readonly Dictionary<string, SipRegistrationService.BlfChannels> _blfChannels = new(StringComparer.OrdinalIgnoreCase);
    private ContactEntry? _editingContact;
    private IncomingCallWindow? _incomingCallWindow;
    private System.Windows.Interop.HwndSource? _hwndSource;
    private GlobalHotkeyService? _hotkeyService;
    private readonly DispatcherTimer _searchDebounceTimer = new() { Interval = TimeSpan.FromMilliseconds(120) };
    private readonly DispatcherTimer _line2AmberFlashTimer = new() { Interval = TimeSpan.FromMilliseconds(450) };
    private bool _line2AmberFlashState = false;
    private readonly DispatcherTimer _line1ResetTimer = new() { Interval = TimeSpan.FromSeconds(4) };
    private readonly DispatcherTimer _line2ResetTimer = new() { Interval = TimeSpan.FromSeconds(4) };
    private const int WM_CLIPBOARDUPDATE = 0x031D;
    private const int WM_DEVICECHANGE = 0x0219;
    private const int DBT_DEVNODES_CHANGED = 0x0007;
    private string _lastClipboardText = "";
    private static readonly System.Windows.Media.FontFamily InCallIconFont = new("Segoe MDL2 Assets");
    private const string HangupIcon = "\uE778";
    private const string MicIcon = "\uE720";
    private const string MutedMicIcon = "\uE74F";
    private const string HoldIcon = "\uE769";
    private const string ResumeIcon = "\uE768";
    private const string ConferenceIcon = "\uE716";
    private const string TransferIcon = "\uE72A";
    private const string RecordIcon = "\uE7C8";

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private const uint FLASHW_STOP = 0;
    private const uint FLASHW_ALL = 3;
    private const uint FLASHW_TIMERNOFG = 12;

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    private void FlashWindow(bool flash)
    {
        if (!_config.FlashCallState && flash) return;
        try
        {
            var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero) return;

            var fi = new FLASHWINFO
            {
                cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<FLASHWINFO>(),
                hwnd = hwnd,
                dwFlags = flash ? (FLASHW_ALL | FLASHW_TIMERNOFG) : FLASHW_STOP,
                uCount = flash ? uint.MaxValue : 0,
                dwTimeout = 0
            };
            FlashWindowEx(ref fi);
        }
        catch { }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool AddClipboardFormatListener(IntPtr hwnd);

    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
    private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

    public MainWindow(AppStartupConfig config)
    {
        _config = config;
        InitializeComponent();
        try
        {
            var iconUri = new Uri("pack://application:,,,/MerlinSIP;component/Assets/CKMedia-Icon.ico", UriKind.RelativeOrAbsolute);
            Icon = System.Windows.Media.Imaging.BitmapFrame.Create(iconUri);
        }
        catch
        {
            // Graceful fallback when resource pack URI cannot be resolved in tests
        }
        if (PresenceContextMenu != null)
        {
            PresenceContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Custom;
            PresenceContextMenu.CustomPopupPlacementCallback = PositionPresenceContextMenu;
        }
        DataContext = _viewModel;
        UpdateActiveDirectoryTab(DirTabHistoryBtn);
        ApplyStartupConfig();
        if (!string.IsNullOrWhiteSpace(_config.DataHandlerUrl))
        {
            _ = _chatService.UpdateServerUrlAsync(_config.DataHandlerUrl);
        }
        ApplyAppVersion();
        LoadDefaultDeviceSelectors();
        DialContactsListView.ItemsSource = _filteredDirectoryContacts;
        DialFavoritesListView.ItemsSource = _filteredDirectoryFavorites;
        PhonebookContactsListView.ItemsSource = _filteredPhonebookContacts;
        ChatContactsListView.ItemsSource = _filteredChatContacts;
        RecentCallsListView.ItemsSource = _filteredRecentCalls;
        CallHistoryListView.ItemsSource = _filteredCallHistory;
        ChatMessagesListView.ItemsSource = _chatThreadMessages;
        _sipRegistrationService.IncomingCall += SipRegistrationService_IncomingCall;
        _chatService.OnConnectionStateChanged += (connected, msg) =>
        {
            Dispatcher.InvokeAsync(async () =>
            {
                SetHandlerServerStatus(connected, 0, msg);
                UpdateChatServerStatus(connected);
                if (connected)
                {
                    await JoinChatRoomsAsync();
                }
            });
        };
        _chatService.OnChatMessageReceived += payload =>
        {
            Dispatcher.InvokeAsync(async () => await HandleIncomingChatMessageAsync(payload));
        };
        _ = _chatService.ConnectAsync();
        _sipRegistrationService.CallProgress += SipRegistrationService_CallProgress;
        _sipRegistrationService.CallEnded += SipRegistrationService_CallEnded;
        _sipRegistrationService.ContactPresenceChanged += SipRegistrationService_ContactPresenceChanged;
        _sipRegistrationService.VoicemailStatusChanged += SipRegistrationService_VoicemailStatusChanged;
        _sipRegistrationService.HeartbeatStatus += SipRegistrationService_HeartbeatStatus;
        _callTimer.Tick += CallTimer_Tick;
        _connectionWatchdog.Tick += ConnectionWatchdog_Tick;
        _licenseWatchdog.Tick += LicenseWatchdog_Tick;
        _remoteConfigSyncTimer.Tick += RemoteConfigSyncTimer_Tick;
        _searchDebounceTimer.Tick += SearchDebounceTimer_Tick;
        _line2AmberFlashTimer.Tick += Line2AmberFlashTimer_Tick;
        _line1ResetTimer.Tick += (s, e) => { _line1ResetTimer.Stop(); if (_line1.Status == "Failed") { _line1.Status = "Idle"; UpdateLineAppearances(); } };
        _line2ResetTimer.Tick += (s, e) => { _line2ResetTimer.Stop(); if (_line2.Status == "Failed") { _line2.Status = "Idle"; UpdateLineAppearances(); } };
        Closing += MainWindow_Closing;
        Loaded += MainWindow_Loaded;
        Closed += MainWindow_Closed;
        Activated += (s, e) => FlashWindow(false);
        InitializeTrayIcon();
        UpdateInCallButtonIcons();
        UpdateCallControls();
        UpdateLineAppearances();
        UpdateAutoAnswerUi();
        UpdateDndUi();
        UpdateUserBadge();
        AudioInputComboBox.SelectionChanged += (s, e) => { if (SettingsOverlay.Visibility == Visibility.Visible) StartMicVuMeter(); };
    }

    private static TextBlock CreateInCallIcon(string glyph, double fontSize = 21)
    {
        return new TextBlock
        {
            Text = glyph,
            FontFamily = InCallIconFont,
            FontSize = fontSize,
            FontWeight = FontWeights.Normal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
            VerticalAlignment = System.Windows.VerticalAlignment.Center
        };
    }

    private static void SetLineIconButton(WpfButton button, string glyph, string? tooltip = null, string? foregroundHex = null)
    {
        var icon = CreateInCallIcon(glyph, 16);
        if (!string.IsNullOrWhiteSpace(foregroundHex))
        {
            var brush = (WpfBrush)new BrushConverter().ConvertFromString(foregroundHex)!;
            icon.Foreground = brush;
            button.Foreground = brush;
        }

        button.Content = icon;
        if (tooltip is not null)
        {
            button.ToolTip = tooltip;
        }
    }

    private static void SetIconButton(WpfButton button, string glyph, string label)
    {
        button.Content = CreateInCallIcon(glyph);
        button.ToolTip = label;
        System.Windows.Automation.AutomationProperties.SetName(button, label);
    }

    private void UpdateInCallButtonIcons()
    {
        SetIconButton(HangupButton, HangupIcon, "Hang up");
        SetIconButton(MuteButton, _muted ? MutedMicIcon : MicIcon, _muted ? "Unmute" : "Mute");
        SetIconButton(HoldButton, _held ? ResumeIcon : HoldIcon, _held ? "Resume" : "Hold");
        SetIconButton(ConferenceButton, ConferenceIcon, "Conference");
        SetIconButton(RecordButton, RecordIcon, _sipRegistrationService.IsRecording ? "Stop recording" : "Record Call");
        SetIconButton(
            TransferButton,
            TransferIcon,
            _sipRegistrationService.IsConferenceActive && !_sipRegistrationService.IsConferenceMerged
                ? "Complete assisted transfer"
                : "Transfer");
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await LoadContactsAsync();
        await LoadCallHistoryAsync();
        await LoadChatMessagesAsync();
        FilterChatContacts();
        UpdateChatServerStatus(_chatService.IsConnected);
        await Dispatcher.InvokeAsync(LoadDeviceSelectors, DispatcherPriority.Background);
        WindowsStartupService.EnableLaunchOnWindowsStartup();
        _licenseWatchdog.Start();
        _remoteConfigSyncTimer.Start();
        _ = CheckForUpdatesOnStartupAsync();
        await VerifyLicenseAsync();
        _ = RegisterSipAsync();
        _connectionWatchdog.Start();
        InitGlobalHotkeys();
        InitHwndHooks();
    }

    private void MainWindow_Closed(object? sender, EventArgs e)
    {
        try { _chatService.Dispose(); } catch { }
        HideIncomingCallSurfaces();
        FlashWindow(false);
        _earlyMediaRingbackCancellation?.Cancel();
        _earlyMediaRingbackCancellation?.Dispose();
        _earlyMediaRingbackCancellation = null;
        _connectionWatchdog.Stop();
        _licenseWatchdog.Stop();
        _trayIcon?.Dispose();
        _trayIcon = null;
        StopMicVuMeter();
        _ringtonePlayer.Dispose();
        _secondaryRingtonePlayer.Dispose();
        _sipRegistrationService.Dispose();
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_allowExit)
        {
            CleanupHooks();
            return;
        }

        e.Cancel = true;
        Hide();
        ShowInTaskbar = false;
        FooterStatusText.Text = "Merlin SIP is running in the notification area.";
    }

    private void CleanupHooks()
    {
        if (_hwndSource != null)
        {
            _hwndSource.RemoveHook(HwndHook);
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (handle != IntPtr.Zero) RemoveClipboardFormatListener(handle);
            _hwndSource = null;
        }
        _hotkeyService?.Dispose();
        _hotkeyService = null;
    }

    private void InitHwndHooks()
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (handle != IntPtr.Zero)
        {
            _hwndSource = System.Windows.Interop.HwndSource.FromHwnd(handle);
            _hwndSource?.AddHook(HwndHook);
            AddClipboardFormatListener(handle);
        }
    }

    private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_DEVICECHANGE && (wParam.ToInt32() == DBT_DEVNODES_CHANGED || wParam.ToInt32() == 0x8000))
        {
            DebugLog.Write("USB audio device change detected. Re-enumerating audio devices...");
            Dispatcher.InvokeAsync(LoadDeviceSelectors, DispatcherPriority.Background);
        }
        else if (msg == WM_CLIPBOARDUPDATE)
        {
            ProcessClipboardUpdate();
        }
        return IntPtr.Zero;
    }

    private void ProcessClipboardUpdate()
    {
        try
        {
            if (System.Windows.Clipboard.ContainsText())
            {
                var text = System.Windows.Clipboard.GetText().Trim();
                if (text != _lastClipboardText && text.Length >= 7 && text.Length <= 18 && text.All(c => char.IsDigit(c) || c == '+' || c == '-' || c == ' '))
                {
                    _lastClipboardText = text;
                    DestinationTextBox.Text = text;
                    NoticeText.Text = "Copied number ready to dial: " + text;
                }
            }
        }
        catch { }
    }

    private void InitGlobalHotkeys()
    {
        try
        {
            _hotkeyService = new GlobalHotkeyService(this);
            _hotkeyService.AnswerRequested += delegate
            {
                if (_incomingRinging) AnswerIncomingCall();
                else if (!_callInProgress && !string.IsNullOrWhiteSpace(DestinationTextBox.Text)) DialButton_Click(this, new RoutedEventArgs());
            };
            _hotkeyService.HoldRequested += delegate { if (_callInProgress) HoldButton_Click(this, new RoutedEventArgs()); };
            _hotkeyService.TransferRequested += delegate { if (_callInProgress) TransferButton_Click(this, new RoutedEventArgs()); };
            _hotkeyService.Register();
        }
        catch (Exception ex)
        {
            DebugLog.Write("Failed to initialize global hotkeys: " + ex.Message);
        }
    }

    private void InitializeTrayIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "CKMedia-Icon.ico");
        var icon = File.Exists(iconPath) ? new DrawingIcon(iconPath) : DrawingSystemIcons.Application;
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("Open Merlin SIP", null, (_, _) => Dispatcher.InvokeAsync(RestoreFromTray));
        menu.Items.Add("Exit Merlin SIP", null, (_, _) => Dispatcher.InvokeAsync(ExitFromTray));

        _trayIcon = new WinForms.NotifyIcon
        {
            Text = "Merlin SIP",
            Icon = icon,
            Visible = true,
            ContextMenuStrip = menu
        };
        _trayIcon.DoubleClick += (_, _) => Dispatcher.InvokeAsync(RestoreFromTray);
    }

    private bool _isMiniWidgetMode;

    public void ToggleMiniWidgetMode()
    {
        _isMiniWidgetMode = !_isMiniWidgetMode;
        if (_isMiniWidgetMode)
        {
            this.Width = 360.0;
            this.Height = 160.0;
            this.Topmost = true;
            this.WindowStyle = WindowStyle.ToolWindow;
            NoticeText.Text = "Mini-Widget Mode Active";
        }
        else
        {
            this.Width = 1420.0;
            this.Height = 900.0;
            this.Topmost = false;
            this.WindowStyle = WindowStyle.SingleBorderWindow;
            NoticeText.Text = "Standard Mode";
        }
    }

    private void ToggleMiniWidgetMode_Click(object sender, RoutedEventArgs e)
    {
        ToggleMiniWidgetMode();
    }

    public void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    public void HandleTelProtocolLaunch(string rawUrl)
    {
        var number = ProtocolHandlerService.ParseTelUrl(rawUrl);
        if (string.IsNullOrWhiteSpace(number))
        {
            return;
        }

        Dispatcher.InvokeAsync(() =>
        {
            RestoreFromTray();
            MainTabs.SelectedItem = PhoneTab;
            DestinationTextBox.Text = number;
            NoticeText.Text = $"Tel link target: {number}";
            FooterStatusText.Text = $"Opened tel: link for {number}";
            UpdateCallControls();

            if (/*_config.AutoDialTelLinks &&*/ !_callInProgress && !_incomingRinging && _registered && !_licenseLocked)
            {
                DialButton_Click(this, new RoutedEventArgs());
            }
        });
    }

    private void ExitFromTray()
    {
        // Trigger full application shutdown ensuring all resources are cleaned up
        _allowExit = true;
        // Close the main window which will invoke cleanup in MainWindow_Closed
        Close();
        // Explicitly shutdown the WPF application (ShutdownMode is OnExplicitShutdown)
        System.Windows.Application.Current?.Shutdown();
    }

    private async void ConnectionWatchdog_Tick(object? sender, EventArgs e)
    {
        await EnsureConnectionReadyAsync();
    }

    private async void LicenseWatchdog_Tick(object? sender, EventArgs e)
    {
        await VerifyLicenseAsync();
    }

    private async Task EnsureConnectionReadyAsync()
    {
        if (_licenseLocked || _connectionCheckInProgress || _callInProgress || _incomingRinging)
        {
            return;
        }

        _connectionCheckInProgress = true;
        try
        {
            if (!NetworkInterface.GetIsNetworkAvailable())
            {
                _registered = false;
                SetConnectionState("No network", "#FFE2E2", "#9B1C1C");
                UpdateCallControls();
                return;
            }

            if (!_registered)
            {
                await RegisterSipAsync();
                return;
            }

            var result = await _sipRegistrationService.RefreshRegistrationAsync();
            if (!result.Connected)
            {
                _registered = false;
                SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
                await RegisterSipAsync();
                return;
            }

            _registered = true;
            SetConnectionState("Connected", "#DFF8EE", "#106247");
            if (DateTimeOffset.UtcNow - _lastPresenceSubscribe > TimeSpan.FromMinutes(30))
            {
                await RefreshPresenceSubscriptionsAsync();
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"EnsureConnectionReady failed error={error.Message}");
            _registered = false;
            SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
            UpdateCallControls();
        }
        finally
        {
            _connectionCheckInProgress = false;
        }
    }

    private void CallTimer_Tick(object? sender, EventArgs e)
    {
        if (WindowState != WindowState.Minimized)
        {
            UpdateCallTimer();
            UpdateLineAppearances();
        }
    }

    private void StartCallTimer()
    {
        _activeCallConnectedAt = DateTimeOffset.Now;
        CallTimerPill.Visibility = Visibility.Visible;
        CallTimerPill.Background = (WpfBrush)new BrushConverter().ConvertFromString("#DFF8EE")!;
        CallTimerText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#106247")!;
        UpdateCallTimer();
        _callTimer.Start();
    }

    private void ShowDialingCallTimer()
    {
        _callTimer.Stop();
        _activeCallConnectedAt = null;
        CallTimerText.Text = "Ringing";
        CallTimerPill.Visibility = Visibility.Visible;
        CallTimerPill.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FFF3D6")!;
        CallTimerText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#8A4F08")!;
    }

    private void StopCallTimer()
    {
        _callTimer.Stop();
        _activeCallConnectedAt = null;
        CallTimerText.Text = "Inactive";
        CallTimerPill.Visibility = Visibility.Visible;
        CallTimerPill.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FFE2E2")!;
        CallTimerText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#9B1C1C")!;
        CallQualityPill.Visibility = Visibility.Collapsed;
    }

    private void UpdateCallTimer()
    {
        if (_activeCallConnectedAt is null)
        {
            CallTimerText.Text = "Inactive";
            CallQualityPill.Visibility = Visibility.Collapsed;
            return;
        }

        var elapsed = DateTimeOffset.Now - _activeCallConnectedAt.Value;
        var time = elapsed.TotalHours >= 1
            ? elapsed.ToString(@"hh\:mm\:ss")
            : elapsed.ToString(@"mm\:ss");
        CallTimerText.Text = $"Active {time}";

        if (_callConnected || _callInProgress)
        {
            if (!_sipRegistrationService.HasMeasuredCallQuality)
            {
                CallQualityPill.Visibility = _config.ShowCallStatistics ? Visibility.Visible : Visibility.Collapsed;
                CallQualityPill.ToolTip = "Call quality has not been measured yet.";
                return;
            }

            var (loss, jitter, latency, _, _) = _sipRegistrationService.GetCallQualityStats();
            var mos = VoipTools.CalculateMosScore(latency, jitter, loss);
            if (!_config.ShowCallStatistics)
            {
                CallQualityPill.Visibility = Visibility.Collapsed;
                return;
            }

            if (mos < 1.0 || latency <= 0)
            {
                CallQualityPill.Visibility = Visibility.Visible;
                CallQualityPill.ToolTip = "Call quality has not been measured yet.";
                return;
            }

            var level = mos >= 4.2 ? "Excellent" : mos >= 3.8 ? "Good" : mos >= 3.0 ? "Fair" : "Poor";

            CallQualityPill.Visibility = Visibility.Visible;
            CallQualityPill.ToolTip = $"Live Call Quality: {mos:F1} MOS ({level})\nJitter: {jitter:F1} ms • Latency: {latency:F0} ms • Loss: {loss:F1}%\nClick to open full analysis";
            if (CallQualityIcon != null)
            {
                CallQualityIcon.Foreground = level switch
                {
                    "Excellent" => (WpfBrush)new BrushConverter().ConvertFromString("#0E987E")!,
                    "Good" => (WpfBrush)new BrushConverter().ConvertFromString("#0284C7")!,
                    "Fair" => (WpfBrush)new BrushConverter().ConvertFromString("#D97706")!,
                    _ => (WpfBrush)new BrushConverter().ConvertFromString("#EF4444")!
                };
            }
        }
        else
        {
            CallQualityPill.Visibility = Visibility.Collapsed;
        }
    }

    private void StartLocalRingback()
    {
        if (_localRingbackActive || !_callInProgress || _callConnected || _incomingRinging)
        {
            return;
        }

        _localRingbackActive = true;
        _ringtonePlayer.StartUkRingback(_config.AudioOutput, _config.HeadphoneVolume);
        DebugLog.Write("LOCAL RINGBACK start cadence=uk");
    }

    private void StopLocalRingback()
    {
        _earlyMediaRingbackCancellation?.Cancel();
        if (!_localRingbackActive)
        {
            return;
        }

        _localRingbackActive = false;
        _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
        DebugLog.Write("LOCAL RINGBACK stop");
    }

    private async void UseRingbackIfEarlyMediaIsSilent()
    {
        _earlyMediaRingbackCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        _earlyMediaRingbackCancellation = cancellation;

        try
        {
            await Task.Delay(1200, cancellation.Token);
            if (_sipRegistrationService.HasInboundRtpAudio)
            {
                StopLocalRingback();
                return;
            }

            if (_activeCallDirection == "Outbound" && _callInProgress && !_callConnected && !_incomingRinging && !_sipRegistrationService.HasInboundRtpAudio)
            {
                StartLocalRingback();
            }

            while (_activeCallDirection == "Outbound" && _callInProgress && !_callConnected && !cancellation.IsCancellationRequested)
            {
                if (_sipRegistrationService.HasInboundRtpAudio)
                {
                    StopLocalRingback();
                    return;
                }

                await Task.Delay(500, cancellation.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            if (ReferenceEquals(_earlyMediaRingbackCancellation, cancellation))
            {
                _earlyMediaRingbackCancellation = null;
            }

            cancellation.Dispose();
        }
    }

    private void ShowIncomingCallWindow(string callerName, string callerNumber)
    {
        _incomingCallWindow?.Close();
        _incomingCallWindow = new IncomingCallWindow(callerName, callerNumber);
        _incomingCallWindow.AnswerRequested += IncomingCallWindow_AnswerRequested;
        _incomingCallWindow.DeclineRequested += IncomingCallWindow_DeclineRequested;
        _incomingCallWindow.Closed += (_, _) => _incomingCallWindow = null;
        _incomingCallWindow.Show();
    }

    private bool ShouldUseDesktopIncomingPopup()
    {
        return !IsVisible || WindowState == WindowState.Minimized || !IsActive;
    }

    private bool IsSilentRingingEnabled()
    {
        return string.Equals(_config.DndMode, "Silent ringing", StringComparison.OrdinalIgnoreCase);
    }

    private bool ShouldSendBusyWhenBusy(string callerNumber)
    {
        var action = IsInternalNumber(callerNumber)
            ? _config.InternalBusyAction
            : _config.ExternalBusyAction;

        return action.Contains("busy", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsInternalNumber(string number)
    {
        var digits = new string(number.Where(char.IsDigit).ToArray());
        return digits.Length > 0 && digits.Length <= 4;
    }

    private void StartIncomingNoAnswerTimeout(string callerNumber)
    {
        CancelIncomingNoAnswerTimeout();
        var seconds = IsInternalNumber(callerNumber)
            ? _config.InternalNoAnswerSeconds
            : _config.ExternalNoAnswerSeconds;

        if (seconds <= 0)
        {
            return;
        }

        var cancellation = new CancellationTokenSource();
        _incomingNoAnswerCancellation = cancellation;
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(seconds), cancellation.Token);
                await Dispatcher.InvokeAsync(() =>
                {
                    if (_incomingRinging && _sipRegistrationService.HasPendingIncomingCall)
                    {
                        FooterStatusText.Text = "Incoming call timed out.";
                        DeclineIncomingCall();
                    }
                });
            }
            catch (OperationCanceledException)
            {
            }
        });
    }

    private void CancelIncomingNoAnswerTimeout()
    {
        _incomingNoAnswerCancellation?.Cancel();
        _incomingNoAnswerCancellation?.Dispose();
        _incomingNoAnswerCancellation = null;
    }

    private async Task ResetFailedCallDisplayAsync(string message)
    {
        var seconds = Math.Max(1, _config.FailedCallDisplaySeconds);
        await Task.Delay(TimeSpan.FromSeconds(seconds));
        await Dispatcher.InvokeAsync(() =>
        {
            if (string.Equals(FooterStatusText.Text, message, StringComparison.Ordinal) ||
                string.Equals(NoticeText.Text, message, StringComparison.Ordinal))
            {
                NoticeText.Text = "Application ready.";
                FooterStatusText.Text = "Application ready.";
            }
        });
    }

    private void HideIncomingCallSurfaces()
    {
        CancelIncomingNoAnswerTimeout();
        IncomingCallOverlay.Visibility = Visibility.Collapsed;
        if (_incomingCallWindow is null)
        {
            return;
        }

        var window = _incomingCallWindow;
        _incomingCallWindow = null;
        window.Close();
    }

    private void IncomingCallWindow_AnswerRequested(object? sender, EventArgs e)
    {
        AnswerIncomingCall();
    }

    private void IncomingCallWindow_DeclineRequested(object? sender, EventArgs e)
    {
        DeclineIncomingCall();
    }

    private void SipRegistrationService_IncomingCall(object? sender, IncomingCallEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            var contact = _contactStore.FindByNumber(_contacts, e.CallerNumber);
            var callerName = contact?.Name ?? e.CallerNumber;
            var alreadyOnCall = _callConnected || (_callInProgress && !_incomingRinging);
            var silentRinging = IsSilentRingingEnabled();
            var useDesktopPopup = !silentRinging && ShouldUseDesktopIncomingPopup();
            _incomingCallIsVideo = e.IsVideo;
            _activeRemoteNumber = e.CallerNumber;
            SetPresenceDisplay("Busy");
            ShowDialingCallTimer();
            DestinationTextBox.Text = e.CallerNumber;
            IncomingCallerNameText.Text = callerName;
            IncomingCallerNumberText.Text = e.CallerNumber;
            SetQueueRingingState(true, callerName);
            IncomingCallOverlay.Visibility = useDesktopPopup ? Visibility.Collapsed : Visibility.Visible;
            CallerLookupText.Text = contact is null ? "Unknown caller" : $"{contact.Name}  {contact.Company}".Trim();
            NoticeText.Text = $"Incoming call from {callerName}.";
            FooterStatusText.Text = "Incoming call received.";
            _activeCallStartedAt = DateTimeOffset.Now;
            _activeCallDirection = "Inbound";
            _incomingRinging = true;
            _callInProgress = true;
            _callConnected = false;
            if (alreadyOnCall)
            {
                _line2.Status = "Incoming";
                _line2.RemoteNumber = e.CallerNumber;
                _line2.RemoteName = callerName;
                _line2.Direction = "Inbound";
                _line2.ConnectedAt = null;
                _line2.IsHeld = false;
            }
            else
            {
                _line1.Status = "Incoming";
                _line1.RemoteNumber = e.CallerNumber;
                _line1.RemoteName = callerName;
                _line1.Direction = "Inbound";
                _line1.ConnectedAt = null;
                _line1.IsHeld = false;
            }
            UpdateCallControls();
            UpdateLineAppearances();

            if (alreadyOnCall && ShouldSendBusyWhenBusy(e.CallerNumber))
            {
                NoticeText.Text = "Incoming call declined because the line is busy.";
                FooterStatusText.Text = "Busy response sent.";
                _ = AddCallHistory("Inbound", callerName, e.CallerNumber, "Busy", "Line was already in use.");
                DeclineIncomingCall();
                return;
            }

            if (!silentRinging)
            {
                _ringtonePlayer.Start(_config.AudioOutput, _config.Ringtone, _config.HeadphoneVolume);
                if (_config.SecondaryRingerOutput != null && !string.IsNullOrWhiteSpace(_config.SecondaryRingerOutput.Id) && _config.SecondaryRingerOutput.Id != _config.AudioOutput.Id)
                {
                    _secondaryRingtonePlayer.Start(_config.SecondaryRingerOutput, _config.Ringtone, _config.HeadphoneVolume);
                }
            }
            FlashWindow(true);

            if (useDesktopPopup)
            {
                ShowIncomingCallWindow(callerName, e.CallerNumber);
            }

            StartIncomingNoAnswerTimeout(e.CallerNumber);

            if (_config.AutoAnswerEnabled)
            {
                _ = Task.Run(async () =>
                {
                    await Task.Delay(1200);
                    await Dispatcher.InvokeAsync(async () =>
                    {
                        if (_incomingRinging && !_callConnected)
                        {
                            IncomingCallWindow_AnswerRequested(this, EventArgs.Empty);
                        }
                    });
                });
            }
        });
    }

    private void SipRegistrationService_CallProgress(object? sender, CallProgressEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            if (e.Connected)
            {
                StopLocalRingback();
                HideIncomingCallSurfaces();
        FlashWindow(false);
                _ = _sipRegistrationService.PublishPresenceAsync("Busy");
                NoticeText.Text = "Call connected.";
                FooterStatusText.Text = "Call connected. Audio session is active.";
                _incomingRinging = false;
                _callInProgress = true;
                _callConnected = true;
                if (_currentCallIsVideo)
                {
                    ShowVideoCallWindow();
                }
                else
                {
                    CloseVideoCallWindow();
                }
                if (_selectedLine == 1)
                {
                    _line1.Status = "Connected";
                    _line1.ConnectedAt = DateTimeOffset.Now;
                    _line1.IsHeld = false;
                }
                else
                {
                    _line2.Status = "Connected";
                    _line2.ConnectedAt = DateTimeOffset.Now;
                    _line2.IsHeld = false;
                }
                StartCallTimer();
                UpdateCallControls();
                UpdateLineAppearances();
                return;
            }

            if (e.Code is 180 or 183)
            {
                if (_activeCallDirection == "Outbound")
                {
                    if (e.Code == 180)
                    {
                        StartLocalRingback();
                    }
                    else
                    {
                        UseRingbackIfEarlyMediaIsSilent();
                    }
                }
                else
                {
                    StopLocalRingback();
                }

                NoticeText.Text = e.Message;
                FooterStatusText.Text = e.Message;
                return;
            }

            if (e.Code == 100)
            {
                NoticeText.Text = "Call setup in progress.";
                FooterStatusText.Text = "Call setup in progress.";
                return;
            }

            if (e.Code >= 300)
            {
                NoticeText.Text = e.Message;
                FooterStatusText.Text = e.Message;
                _ = ResetFailedCallDisplayAsync(e.Message);
                
                string state = "Failed";
                if (e.Code == 486) state = "Busy";
                else if (e.Code == 487) state = "Cancelled";
                else if (e.Code == 603) state = "Declined";
                
                _ = Dispatcher.InvokeAsync(async () =>
                {
                    try
                    {
                        await OnCallFinished(state, e.Message ?? string.Empty);
                    }
                    catch (Exception ex)
                    {
                        DebugLog.Write($"CallProgress OnCallFinished error: {ex.Message}");
                    }
                });
            }
        });
    }

    private void SipRegistrationService_ContactPresenceChanged(object? sender, ContactPresenceEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            var isOwnExtension = IsOwnPresenceNumber(e.Number);

            if (isOwnExtension)
            {
                if (_callInProgress || _callConnected || _incomingRinging)
                {
                    UpdateMainPresenceDisplayOnly(_incomingRinging ? "Ringing" : "Busy");
                    if (string.Equals(e.Presence, "Available", StringComparison.OrdinalIgnoreCase) && _callConnected)
                    {
                        DebugLog.Write("UI own BLF reports Available while call is active; clearing stale call display.");
                        _sipRegistrationService.ClearStaleCallState("own BLF available");
                        _ = OnCallFinished("Ended", "Call ended.");
                    }
                }
                else
                {
                    UpdateMainPresenceDisplayOnly(
                        e.Presence == "Busy" || e.Presence == "Ringing" || e.Presence == "DND" || e.Presence == "Away"
                            ? e.Presence
                            : _userSelectedPresence);
                }
            }

            SetContactPresence(e.Number, e.Presence, e.EventName);
            if (string.Equals(e.Presence, "Ringing", StringComparison.OrdinalIgnoreCase))
            {
                SetQueueRingingState(true, e.Number);
            }
            else if (_queueIsRinging && !_incomingRinging && !string.Equals(e.Presence, "Ringing", StringComparison.OrdinalIgnoreCase))
            {
                SetQueueRingingState(false);
            }
        });
    }

    private bool IsOwnPresenceNumber(string number)
    {
        var normalized = NormalizeDialDestination(number);
        if (!string.IsNullOrWhiteSpace(_config.Extension) &&
            string.Equals(normalized, NormalizeDialDestination(_config.Extension), StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(_config.Username) &&
               string.Equals(normalized, NormalizeDialDestination(_config.Username), StringComparison.OrdinalIgnoreCase);
    }

    private void SipRegistrationService_HeartbeatStatus(object? sender, HeartbeatStatusEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            if (_callInProgress || _incomingRinging)
            {
                return;
            }

            if (e.Success)
            {
                _registered = true;
                SetConnectionState("Connected", "#DFF8EE", "#106247");
                UpdateCallControls();
                return;
            }

            DebugLog.Write($"HEARTBEAT status failed code={e.ResponseCode} failures={e.ConsecutiveFailures} message={e.Message}");
            if (e.ConsecutiveFailures >= 3)
            {
                _registered = false;
                SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
                UpdateCallControls();
            }
        }, DispatcherPriority.Background);
    }

    private void SipRegistrationService_CallEnded(object? sender, CallEndedEventArgs e)
    {
        _ = Dispatcher.InvokeAsync(async () =>
        {
            NoticeText.Text = "Call ended.";
            FooterStatusText.Text = e.Message;
            SetQueueRingingState(false);

            var isFailure = !_callConnected || (e.Message != null && (
                e.Message.Contains("Fail", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("Reject", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("Declin", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("Busy", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("486", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("404", StringComparison.OrdinalIgnoreCase) ||
                e.Message.Contains("Cancel", StringComparison.OrdinalIgnoreCase)));

            StopLine2AmberFlash();

            if (e.LineNumber == 2)
            {
                if (isFailure && _line2.Status != "Idle")
                {
                    _line2.Status = "Failed";
                    _line2ResetTimer.Stop();
                    _line2ResetTimer.Start();
                }
                else
                {
                    _line2.Status = "Idle";
                    _line2.RemoteNumber = "";
                    _line2.RemoteName = "";
                }
                _line2.ConnectedAt = null;
                _line2.IsHeld = false;
                if (_line1.HasCall) SelectLine(1);
            }
            else if (e.LineNumber == 1)
            {
                if (isFailure && _line1.Status != "Idle")
                {
                    _line1.Status = "Failed";
                    _line1ResetTimer.Stop();
                    _line1ResetTimer.Start();
                }
                else
                {
                    _line1.Status = "Idle";
                    _line1.RemoteNumber = "";
                    _line1.RemoteName = "";
                }
                _line1.ConnectedAt = null;
                _line1.IsHeld = false;
                if (_line2.HasCall) SelectLine(2);
            }
            else
            {
                if (_selectedLine == 2)
                {
                    if (isFailure && _line2.Status != "Idle")
                    {
                        _line2.Status = "Failed";
                        _line2ResetTimer.Stop();
                        _line2ResetTimer.Start();
                    }
                    else
                    {
                        _line2.Status = "Idle";
                        _line2.RemoteNumber = "";
                        _line2.RemoteName = "";
                    }
                    _line2.ConnectedAt = null;
                    _line2.IsHeld = false;
                    if (_line1.HasCall) SelectLine(1);
                }
                else
                {
                    if (isFailure && _line1.Status != "Idle")
                    {
                        _line1.Status = "Failed";
                        _line1ResetTimer.Stop();
                        _line1ResetTimer.Start();
                    }
                    else
                    {
                        _line1.Status = "Idle";
                        _line1.RemoteNumber = "";
                        _line1.RemoteName = "";
                    }
                    _line1.ConnectedAt = null;
                    _line1.IsHeld = false;
                    if (_line2.HasCall) SelectLine(2);
                }
            }
            UpdateLineAppearances();
            
            string state = "Ended";
            if (!_callConnected)
            {
                state = _activeCallDirection == "Outbound" ? "No Answer" : "Missed";
            }
            await OnCallFinished(state, e.Message ?? string.Empty);
        });
    }



    private void ApplyStartupConfig()
    {
        _config = _config.WithFixedSipEndpoint();
        ExtensionTextBox.Text = _config.Extension;
        if (_config.IsProvisioned)
        {
            UsernameTextBox.Text = "••••••••";
            UsernameTextBox.IsReadOnly = true;
            UsernameTextBox.IsEnabled = false;
            PasswordBox.Password = "••••••••••••";
            PasswordBox.IsEnabled = false;
            PasswordTextBox.Text = "••••••••••••";
            PasswordTextBox.Visibility = Visibility.Collapsed;
            PasswordBox.Visibility = Visibility.Visible;
            TogglePasswordButton.Visibility = Visibility.Collapsed;
            ProvisionedCredentialsBadge.Visibility = Visibility.Visible;
            SwitchToManualConfigButton.Visibility = Visibility.Visible;
            _passwordRevealed = false;
        }
        else
        {
            UsernameTextBox.Text = _config.Username;
            UsernameTextBox.IsReadOnly = false;
            UsernameTextBox.IsEnabled = true;
            PasswordBox.Password = _config.Password;
            PasswordBox.IsEnabled = true;
            PasswordTextBox.Text = _config.Password;
            TogglePasswordButton.Visibility = Visibility.Visible;
            ProvisionedCredentialsBadge.Visibility = Visibility.Collapsed;
            SwitchToManualConfigButton.Visibility = Visibility.Collapsed;
        }
        var isBuyout = _config.AllowsCustomSipEndpoint;
        SetupCodeCard.Visibility = isBuyout ? Visibility.Collapsed : Visibility.Visible;
        SettingsProvisioningCodeTextBox.IsEnabled = !isBuyout;
        ProvisionAndReconnectButton.IsEnabled = !isBuyout;
        PrivatePbxSettingsPanel.Visibility = isBuyout ? Visibility.Visible : Visibility.Collapsed;
        PrivatePbxSettingsTextBox.IsEnabled = isBuyout;
        PrivatePbxSettingsTextBox.Text = isBuyout && !string.IsNullOrWhiteSpace(_config.Server) ? _config.Server : string.Empty;
        PrivateDataHandlerTextBox.IsEnabled = isBuyout;
        PrivateDataHandlerTextBox.Text = isBuyout && !string.IsNullOrWhiteSpace(_config.DataHandlerUrl) ? _config.DataHandlerUrl : string.Empty;
        SipAlgCompatibilityCheckBox.IsChecked = _config.SipAlgCompatibilityMode;
        IgnoreSslErrorsCheckBox.IsChecked = _config.IgnoreSslErrors;
        SelectSipTransportMode(_config.SipSignallingTransport);
        LicenseStatusText.Text = ShortLicenseStatus(_config.LicenseStatus);
        LicensedToText.Text = LicenseeFromStatus(_config.LicenseStatus);
        LoadApplicationSettingsControls();
        UpdateNetworkAssistanceText();
        ApplyDndMode();
    }

    private void LoadApplicationSettingsControls()
    {
        MobileNumberTextBox.Text = _config.MobileNumber;
        SelectComboBoxItem(DndModeComboBox, _config.DndMode);
        SingleClickBlindTransferCheckBox.IsChecked = _config.SingleClickBlindTransfer;
        FlashCallStateCheckBox.IsChecked = _config.FlashCallState;
        ShowCallStatisticsCheckBox.IsChecked = _config.ShowCallStatistics;
        SelectComboBoxItem(DeclineActionComboBox, _config.DeclineIncomingAction);
        SelectComboBoxItem(InternalBusyActionComboBox, _config.InternalBusyAction);
        SelectComboBoxItem(InternalNoAnswerTimeoutComboBox, $"{_config.InternalNoAnswerSeconds} seconds");
        SelectComboBoxItem(ExternalBusyActionComboBox, _config.ExternalBusyAction);
        SelectComboBoxItem(ExternalNoAnswerTimeoutComboBox, $"{_config.ExternalNoAnswerSeconds} seconds");
        QueuePickupCheckBox.IsChecked = _config.QueuePickupEnabled;
        if (QueueLineContainer != null)
        {
            QueueLineContainer.Visibility = _config.QueuePickupEnabled ? Visibility.Visible : Visibility.Collapsed;
        }
        SetQueueRingingState(false);
        CombineContactsCheckBox.IsChecked = _config.CombineContactsInSearch;
        SelectComboBoxItem(FailedCallTimeoutComboBox, $"{_config.FailedCallDisplaySeconds} seconds");
        CallPickupPrefixTextBox.Text = string.IsNullOrWhiteSpace(_config.CallPickupPrefix) ? "*4" : _config.CallPickupPrefix;
        QueueToggleCodeTextBox.Text = string.IsNullOrWhiteSpace(_config.QueueLoginLogoutCode) ? "*62" : _config.QueueLoginLogoutCode;
        CallRecordingCodeTextBox.Text = string.IsNullOrWhiteSpace(_config.CallRecordingCode) ? "*1" : _config.CallRecordingCode;
        VoicemailCodeTextBox.Text = string.IsNullOrWhiteSpace(_config.VoicemailNumber) ? "*2" : _config.VoicemailNumber;
    }

    private static void SelectComboBoxItem(System.Windows.Controls.ComboBox comboBox, string value)
    {
        foreach (var item in comboBox.Items.OfType<ComboBoxItem>())
        {
            if (string.Equals(item.Content?.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                comboBox.SelectedItem = item;
                return;
            }
        }

        comboBox.SelectedIndex = comboBox.Items.Count > 0 ? 0 : -1;
    }

    private static string ComboBoxText(System.Windows.Controls.ComboBox comboBox, string fallback)
    {
        return comboBox.SelectedItem is ComboBoxItem item && item.Content is not null
            ? item.Content.ToString() ?? fallback
            : fallback;
    }

    private static string ComboBoxTag(System.Windows.Controls.ComboBox comboBox, string fallback)
    {
        return comboBox.SelectedItem is ComboBoxItem item && item.Tag is not null
            ? item.Tag.ToString() ?? fallback
            : fallback;
    }

    private void SelectSipTransportMode(string transport)
    {
        var normalized = string.Equals(transport, AppStartupConfig.TransportTcp, StringComparison.OrdinalIgnoreCase)
            ? AppStartupConfig.TransportTcp
            : string.Equals(transport, AppStartupConfig.TransportTls, StringComparison.OrdinalIgnoreCase)
                ? AppStartupConfig.TransportTls
                : AppStartupConfig.TransportUdp;

        foreach (var item in SipTransportModeComboBox.Items.OfType<ComboBoxItem>())
        {
            if (string.Equals(item.Tag?.ToString(), normalized, StringComparison.OrdinalIgnoreCase))
            {
                SipTransportModeComboBox.SelectedItem = item;
                return;
            }
        }

        SipTransportModeComboBox.SelectedIndex = 0;
    }

    private static int ComboBoxSeconds(System.Windows.Controls.ComboBox comboBox, int fallback)
    {
        var text = ComboBoxText(comboBox, $"{fallback} seconds");
        var digits = new string(text.Where(char.IsDigit).ToArray());
        return int.TryParse(digits, out var value) ? value : fallback;
    }


    private void RemoteConfigSyncTimer_Tick(object? sender, EventArgs e)
    {
        _ = SyncRemoteConfigAsync();
    }

    private async Task SyncRemoteConfigAsync()
    {
        if (_config.AllowsCustomSipEndpoint)
        {
            // Buyout contractor mode: does not poll Chris Kendall media endpoints
            return;
        }
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            using var request = new HttpRequestMessage(HttpMethod.Get, "https://accounts.chriskendall.media/api/v1/config/sync");
            request.Headers.Add("User-Agent", "MerlinSIP/1.3.9.3");
            using var response = await HttpClientHelper.SharedClient.SendAsync(request, cts.Token);

            if (!response.IsSuccessStatusCode) return;
            var json = await response.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("data_handler", out var dh) && dh.TryGetProperty("socket_url", out var socketUrl))
            {
                var newHandler = socketUrl.GetString();
                if (!string.IsNullOrWhiteSpace(newHandler) && !string.Equals(_config.DataHandlerUrl, newHandler, StringComparison.OrdinalIgnoreCase))
                {
                    _config = _config with { DataHandlerUrl = newHandler };
                    await _cacheService.SaveSettingsAsync(_config);
                    await _chatService.UpdateServerUrlAsync(newHandler);
                    DebugLog.Write($"REMOTE SYNC: Updated data handler URL to {newHandler}");
                }
            }
        }
        catch (Exception ex)
        {
            // Fail completely silently: network timeout or offline should never interrupt normal operation
            DebugLog.Write($"REMOTE SYNC: Check completed with notice: {ex.Message}");
        }
    }
    private async Task VerifyLicenseAsync()
    {
        if (_licenseCheckInProgress)
        {
            return;
        }

        _licenseCheckInProgress = true;
        try
        {
            var result = await _licenseService.VerifyAsync(_config.LicenseKey, _config.LicenseLocalKey);
            if (!result.Checked)
            {
                FooterStatusText.Text = result.Message;
                return;
            }

            if (!result.Active)
            {
                LockForInactiveLicense(result.Message);
                return;
            }

            _licenseLocked = false;
            var status = string.IsNullOrWhiteSpace(result.Message) ? _config.LicenseStatus : result.Message;
            _config = _config with
            {
                LicenseStatus = status,
                LicenseLocalKey = _licenseService.LocalKey ?? _config.LicenseLocalKey
            };
            await _cacheService.SaveSettingsAsync(_config.WithFixedSipEndpoint());
            if (result.Profile != null)
            {
                var prof = result.Profile;
                if (!string.IsNullOrWhiteSpace(prof.HandlerUrl) && !string.Equals(_config.DataHandlerUrl, prof.HandlerUrl, StringComparison.OrdinalIgnoreCase))
                {
                    _config = _config with { DataHandlerUrl = prof.HandlerUrl.Trim() };
                    _ = _chatService.UpdateServerUrlAsync(prof.HandlerUrl.Trim());
                    DebugLog.Write($"LICENSE SYNC: Auto-bound data handler URL to {prof.HandlerUrl}");
                }
                if (!string.IsNullOrWhiteSpace(prof.SipServer))
                {
                    _config = _config with
                    {
                        Server = prof.SipServer.Trim(),
                        Domain = prof.SipServer.Trim(),
                        Port = prof.SipPort ?? _config.Port,
                        SipSignallingTransport = prof.SipTransport ?? _config.SipSignallingTransport
                    };
                    DebugLog.Write($"LICENSE SYNC: Auto-bound SIP server to {prof.SipServer}:{_config.Port}");
                }
            }
            LicenseStatusText.Text = ShortLicenseStatus(status);
            LicensedToText.Text = string.IsNullOrWhiteSpace(result.Licensee)
                ? LicenseeFromStatus(status)
                : result.Licensee;
            UpdateCallControls();
        }
        finally
        {
            _licenseCheckInProgress = false;
        }
    }

    private void LockForInactiveLicense(string message)
    {
        _licenseLocked = true;
        _registered = false;
        _callInProgress = false;
        _callConnected = false;
        _incomingRinging = false;
        StopLocalRingback();
        _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
        HideIncomingCallSurfaces();
        FlashWindow(false);
        _sipRegistrationService.Dispose();
        SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
        LicenseStatusText.Text = "Licence inactive";
        LicensedToText.Text = "Inactive";
        NoticeText.Text = "Licence inactive.";
        FooterStatusText.Text = string.IsNullOrWhiteSpace(message)
            ? "This licence is inactive. Contact CK Media Services."
            : message;
        UpdateCallControls();
    }

    private static string ShortLicenseStatus(string status)
    {
        return string.IsNullOrWhiteSpace(status) ? "Licensed" : status;
    }

    private static string LicenseeFromStatus(string status)
    {
        const string prefix = "Licensed to ";
        if (status.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return status[prefix.Length..].Trim();
        }

        return string.IsNullOrWhiteSpace(status) ? "CK Media Services" : status;
    }

    private void LoadDeviceSelectors()
    {
        AudioInputComboBox.ItemsSource = _deviceDiscoveryService.GetAudioInputs();
        var audioOutputs = _deviceDiscoveryService.GetAudioOutputs();
        AudioOutputComboBox.ItemsSource = audioOutputs;
        BindSecondaryRinger(audioOutputs);
        var videoSources = _deviceDiscoveryService.GetVideoSources();
        VideoSourceComboBox.ItemsSource = videoSources;
        if (_config.VideoSource != null)
        {
            SelectDevice(VideoSourceComboBox, _config.VideoSource);
        }
        else if (VideoSourceComboBox.Items.Count > 0)
        {
            VideoSourceComboBox.SelectedIndex = 0;
        }
        RingtoneComboBox.ItemsSource = RingtonePlayer.Choices;
        SelectDevice(AudioInputComboBox, _config.AudioInput);
        SelectDevice(AudioOutputComboBox, _config.AudioOutput);
        SelectRingtone(_config.Ringtone);
        LoadVolumeSliders();
    }

    private void LoadDefaultDeviceSelectors()
    {
        AudioInputComboBox.ItemsSource = _deviceDiscoveryService.GetAudioInputs();
        var audioOutputs = _deviceDiscoveryService.GetAudioOutputs();
        AudioOutputComboBox.ItemsSource = audioOutputs.Count > 0 ? audioOutputs : new[] { _config.AudioOutput };
        BindSecondaryRinger(audioOutputs);
        var videoSources = _deviceDiscoveryService.GetVideoSources();
        VideoSourceComboBox.ItemsSource = videoSources;
        if (_config.VideoSource != null)
        {
            SelectDevice(VideoSourceComboBox, _config.VideoSource);
        }
        else if (VideoSourceComboBox.Items.Count > 0)
        {
            VideoSourceComboBox.SelectedIndex = 0;
        }
        RingtoneComboBox.ItemsSource = RingtonePlayer.Choices;
        SelectDevice(AudioInputComboBox, _config.AudioInput);
        SelectDevice(AudioOutputComboBox, _config.AudioOutput);
        SelectRingtone(_config.Ringtone);
        LoadVolumeSliders();
    }

    private void BindSecondaryRinger(IReadOnlyList<MediaDeviceInfo> outputs)
    {
        var devices = outputs.Count > 0
            ? outputs
            : new[] { _config.SecondaryRingerOutput ?? _config.AudioOutput };
        SecondaryRingerComboBox.ItemsSource = devices;
        var selected = _config.SecondaryRingerOutput ?? _config.AudioOutput;
        SelectDevice(SecondaryRingerComboBox, selected);
    }

    private static void SelectDevice(System.Windows.Controls.ComboBox comboBox, MediaDeviceInfo selected)
    {
        foreach (var item in comboBox.Items.OfType<MediaDeviceInfo>())
        {
            if (item.Id == selected.Id || item.Name == selected.Name)
            {
                comboBox.SelectedItem = item;
                return;
            }
        }

        comboBox.SelectedIndex = comboBox.Items.Count > 0 ? 0 : -1;
    }

    private void SelectRingtone(string ringtone)
    {
        RingtoneComboBox.SelectedItem = RingtonePlayer.Choices.FirstOrDefault(choice => choice.Id == ringtone)
            ?? RingtonePlayer.Choices.FirstOrDefault(choice => choice.Id == AppStartupConfig.DefaultRingtone)
            ?? RingtonePlayer.Choices[0];
    }

    private void LoadVolumeSliders()
    {
        HeadphoneVolumeSlider.Value = _config.HeadphoneVolume * 100;
        MicrophoneVolumeSlider.Value = _config.MicrophoneVolume * 100;
        UpdateVolumeText();
    }

    private void VolumeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        UpdateVolumeText();
    }

    private void UpdateVolumeText()
    {
        if (!IsLoaded)
        {
            return;
        }

        HeadphoneVolumeText.Text = $"{HeadphoneVolumeSlider.Value:0}%";
        MicrophoneVolumeText.Text = $"{MicrophoneVolumeSlider.Value:0}%";
    }

    private async Task RegisterSipAsync()
    {
        if (_licenseLocked)
        {
            SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
            ServerStatusText.Text = "Licence inactive.";
            UpdateCallControls();
            return;
        }

        SetConnectionState("Connecting...", "#FFF1D6", "#8A4F08");
        ServerStatusText.Text = "Checking account connection.";
        await RefreshConnectionDiagnosticsAsync();
        if (!NetworkInterface.GetIsNetworkAvailable())
        {
            _registered = false;
            SetConnectionState("No network", "#FFE2E2", "#9B1C1C");
            ServerStatusText.Text = "No network connectivity detected.";
            UpdateCallControls();
            return;
        }

        SipRegistrationResult result;
        try
        {
            result = await _sipRegistrationService.RegisterAsync(_config);
        }
        catch (Exception error)
        {
            DebugLog.Write($"REGISTER unhandled error={error.Message}");
            result = new SipRegistrationResult(false, $"Unable to connect: {error.Message}");
        }

        if (result.Connected)
        {
            _registered = true;
            SetConnectionState("Connected", "#DFF8EE", "#106247");
            ServerStatusText.Text = ToCustomerConnectionMessage(result.Message);
            await RefreshPresenceSubscriptionsAsync();
        }
        else
        {
            if (!_config.UsesTcpSignalling && !_config.UsesTlsSignalling &&
                (result.Message.Contains("Timed out", StringComparison.OrdinalIgnoreCase) || 
                 result.Message.Contains("Socket error", StringComparison.OrdinalIgnoreCase) ||
                 result.Message.Contains("Unable to connect", StringComparison.OrdinalIgnoreCase)))
            {
                DebugLog.Write("UDP register failed/timed out. Attempting automatic fallback to TCP signalling for SIP ALG / Virgin Media line compatibility...");
                var tcpConfig = _config with { SipSignallingTransport = AppStartupConfig.TransportTcp };
                try
                {
                    var tcpResult = await _sipRegistrationService.RegisterAsync(tcpConfig);
                    if (tcpResult.Connected)
                    {
                        DebugLog.Write("TCP fallback registration successful! Updating config to use TCP.");
                        _config = tcpConfig;
                        await _cacheService.SaveSettingsAsync(_config.WithFixedSipEndpoint());
                        ApplyStartupConfig();
        if (!string.IsNullOrWhiteSpace(_config.DataHandlerUrl))
        {
            _ = _chatService.UpdateServerUrlAsync(_config.DataHandlerUrl);
        }
                        result = tcpResult;
                    }
                }
                catch (Exception tcpError)
                {
                    DebugLog.Write($"TCP fallback failed: {tcpError.Message}");
                }
            }

            if (result.Connected)
            {
                _registered = true;
                SetConnectionState("Connected", "#DFF8EE", "#106247");
                ServerStatusText.Text = ToCustomerConnectionMessage(result.Message);
                await RefreshPresenceSubscriptionsAsync();
            }
            else
            {
                _registered = false;
                SetConnectionState("Not connected", "#FFE2E2", "#9B1C1C");
                ServerStatusText.Text = ToCustomerConnectionMessage(result.Message);
            }
        }

        await RefreshConnectionDiagnosticsAsync();
        UpdateCallControls();
    }

    private void SetConnectionState(string text, string background, string foreground)
    {
        _viewModel.ConnectionState = text;
        ConnectionStatusText.Text = text;
        ConnectionPill.Background = (WpfBrush)new BrushConverter().ConvertFromString(background)!;
        ConnectionStatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString(foreground)!;

        bool isConnected = text.Equals("Connected", StringComparison.OrdinalIgnoreCase);
        if (ServerAlertBanner != null)
        {
            ServerAlertBanner.Visibility = isConnected ? Visibility.Collapsed : Visibility.Visible;
            if (!isConnected)
            {
                ServerAlertText.Text = text.Equals("Connecting...", StringComparison.OrdinalIgnoreCase)
                    ? "Reduced Functionality: Attempting to connect to the server, call functionality temporarily unavailable."
                    : text.Equals("No network", StringComparison.OrdinalIgnoreCase)
                        ? "Reduced Functionality: No network connection detected, attempting to reconnect..."
                        : $"Reduced Functionality: Offline ({text}). Attempting to reconnect to PBX server.";
            }
        }

        if (FooterStatusBar != null)
        {
            FooterStatusBar.Visibility = isConnected ? Visibility.Collapsed : Visibility.Visible;
            FooterStatusBar.Background = (WpfBrush)new BrushConverter().ConvertFromString(background)!;
            FooterStatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString(foreground)!;
            FooterStatusText.Text = isConnected ? "Live connectivity status: Connected" : $"Connection: {text}";
        }
    }

    private void ApplyAppVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        var versionStr = version is null
            ? "Unknown"
            : version.Revision > 0
                ? $"{version.Major}.{version.Minor}.{version.Build}.{version.Revision}"
                : $"{version.Major}.{version.Minor}.{version.Build}";
        AppVersionText.Text = $"v{versionStr}";
        AboutVersionText.Text = versionStr;
        UpdateStatusText.Text = $"Version {versionStr}";
        ProductIdText.Text = LicenseService.ProductId;
    }

    private async Task RefreshConnectionDiagnosticsAsync()
    {
        PingStatusText.Text = "Checking...";
        _ = RefreshHandlerServerDiagnosticsAsync();
        try
        {
            using var ping = new Ping();
            var targetHost = _sipRegistrationService.ServerEndpointAddress ?? _config.Server;
            var reply = await ping.SendPingAsync(targetHost, 2500);
            if (reply.Status == IPStatus.Success)
            {
                PingStatusText.Text = $"{reply.RoundtripTime} ms";
                return;
            }

            PingStatusText.Text = NetworkInterface.GetIsNetworkAvailable()
                ? reply.Status.ToString()
                : "No network connectivity";
        }
        catch (Exception error)
        {
            DebugLog.Write($"PING failed error={error.Message}");
            PingStatusText.Text = NetworkInterface.GetIsNetworkAvailable()
                ? "Unavailable"
                : "No network connectivity";
        }
    }

    private void SetHandlerServerStatus(bool connected, long latencyMs, string? statusMessage)
    {
        if (HandlerServerPill == null || HandlerServerStatusPillText == null || HandlerServerStatusText == null) return;

        if (connected)
        {
            HandlerServerPill.Background = (WpfBrush)new BrushConverter().ConvertFromString("#DCFCE7")!;
            HandlerServerStatusPillText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#15803D")!;
            HandlerServerStatusPillText.Text = "Connected";
            HandlerServerStatusText.Text = string.IsNullOrWhiteSpace(statusMessage) ? "Operational" : statusMessage;
            if (HandlerPingStatusText != null)
            {
                HandlerPingStatusText.Text = latencyMs > 0 ? $"{latencyMs} ms" : "Connected";
            }
        }
        else
        {
            HandlerServerPill.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FEE2E2")!;
            HandlerServerStatusPillText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#B91C1C")!;
            HandlerServerStatusPillText.Text = "Offline";
            HandlerServerStatusText.Text = string.IsNullOrWhiteSpace(statusMessage) ? "Service unavailable" : statusMessage;
            if (HandlerPingStatusText != null)
            {
                HandlerPingStatusText.Text = "Unavailable";
            }
        }
    }

    private async Task RefreshHandlerServerDiagnosticsAsync()
    {
        if (HandlerServerStatusText == null) return;
        try
        {
            var result = await _chatService.ProbeServerAsync();
            SetHandlerServerStatus(result.Connected, result.LatencyMs, result.Message);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Handler server probe error: {ex.Message}");
            SetHandlerServerStatus(false, 0, "Unreachable");
        }
    }

    private static string ToCustomerConnectionMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return "Connection unavailable.";
        }

        if (message.Contains("No such host", StringComparison.OrdinalIgnoreCase))
        {
            return NetworkInterface.GetIsNetworkAvailable()
                ? "Unable to reach the service."
                : "No network connectivity detected.";
        }

        if (message.Contains("Timed out", StringComparison.OrdinalIgnoreCase))
        {
            return "Connection timed out.";
        }

        if (message.Contains("Call in progress", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("Connection check in progress", StringComparison.OrdinalIgnoreCase))
        {
            return "Connection is being maintained.";
        }

        return message
            .Replace("SIP server returned 0 ", "", StringComparison.OrdinalIgnoreCase)
            .Replace("SIP registration failed: ", "", StringComparison.OrdinalIgnoreCase)
            .Replace("SIP server returned ", "", StringComparison.OrdinalIgnoreCase);
    }

    private async Task LoadContactsAsync()
    {
        _contacts.Clear();
        foreach (var contact in await _contactStore.LoadAsync())
        {
            _contacts.Add(contact);
        }

        ApplyGlobalSearchFilter();
        _ = RefreshPresenceSubscriptionsAsync();
    }

    private async Task RefreshPresenceSubscriptionsAsync()
    {
        if (!_registered)
        {
            return;
        }

        var extensions = _contacts.Select(contact => contact.Number);
        if (!string.IsNullOrWhiteSpace(_config.Extension))
        {
            extensions = extensions.Concat(new[] { _config.Extension });
        }
        await _sipRegistrationService.SubscribeToContactPresenceAsync(extensions.Distinct());
        _lastPresenceSubscribe = DateTimeOffset.UtcNow;
    }

    private void SetContactPresence(string number, string presence, string eventName = "")
    {
        if (string.IsNullOrWhiteSpace(number))
        {
            return;
        }

        var normalized = NormalizeDialDestination(number);
        _blfChannels.TryGetValue(normalized, out var channels);
        channels = SipRegistrationService.BlfChannels.Apply(channels, presence, eventName);
        _blfChannels[normalized] = channels;
        var resolved = channels.Resolve();
        for (var index = 0; index < _contacts.Count; index++)
        {
            if (!string.Equals(NormalizeDialDestination(_contacts[index].Number), normalized, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            _contacts[index] = _contacts[index] with { Presence = resolved };
        }

        ApplyGlobalSearchFilter();
    }

    private async Task LoadCallHistoryAsync()
    {
        _callHistory.Clear();
        var loadedCalls = await _callHistoryStore.LoadAsync();
        foreach (var call in loadedCalls)
        {
            _callHistory.Add(call);
        }

        var lastOutbound = _callHistory.FirstOrDefault(c => string.Equals(c.Direction, "Outbound", StringComparison.OrdinalIgnoreCase));
        if (lastOutbound is not null && !string.IsNullOrWhiteSpace(lastOutbound.Number))
        {
            _lastDialedNumber = lastOutbound.Number;
        }

        ApplyGlobalSearchFilter();
        UpdateCallControls();
    }

    private void ApplyGlobalSearchFilter()
    {
        SearchDebounceTimer_Tick(null, EventArgs.Empty);
    }


    private IEnumerable<ContactEntry> FilterFavorites(IEnumerable<ContactEntry> source, string query)
    {
        var favorites = source.Where(c => c.IsFavorite);
        return string.IsNullOrWhiteSpace(query)
            ? favorites
            : favorites.Where(contact =>
                ContainsSearchText(contact.Name, query) ||
                ContainsSearchText(contact.Number, query) ||
                ContainsSearchText(contact.Company, query) ||
                ContainsSearchText(contact.Notes, query) ||
                ContainsSearchText(contact.PresenceLabel, query));
    }

    private IEnumerable<ContactEntry> FilterContacts(IEnumerable<ContactEntry> source, string query)
    {
        return string.IsNullOrWhiteSpace(query)
            ? source
            : source.Where(contact =>
                ContainsSearchText(contact.Name, query) ||
                ContainsSearchText(contact.Number, query) ||
                ContainsSearchText(contact.Company, query) ||
                ContainsSearchText(contact.Notes, query) ||
                ContainsSearchText(contact.PresenceLabel, query));
    }

    private IEnumerable<CallHistoryEntry> FilterCalls(IEnumerable<CallHistoryEntry> source, string query)
    {
        return string.IsNullOrWhiteSpace(query)
            ? source
            : source.Where(call =>
                ContainsSearchText(call.Name, query) ||
                ContainsSearchText(call.Number, query) ||
                ContainsSearchText(call.Direction, query) ||
                ContainsSearchText(call.Result, query) ||
                ContainsSearchText(call.Detail, query) ||
                ContainsSearchText(call.StartedAt, query));
    }

    private static bool ContainsSearchText(string value, string query)
    {
        return !string.IsNullOrWhiteSpace(value) &&
            value.Contains(query, StringComparison.OrdinalIgnoreCase);
    }

    private static void ReplaceCollection<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
        }
    }

    private void DestinationTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        var destination = DestinationTextBox.Text.Trim();
        DestinationPreviewText.Text = string.IsNullOrWhiteSpace(destination) ? "Enter number" : destination;
        UpdateCallControls();
        UpdateLineAppearances();

        var contact = _contactStore.FindByNumber(_contacts, destination);
        CallerLookupText.Text = contact is null
            ? "No matching contact"
            : $"{contact.Name}  {contact.Company}".Trim();
    }

    private void GlobalSearchClearButton_Click(object sender, RoutedEventArgs e)
    {
        GlobalSearchTextBox.Text = string.Empty;
        GlobalSearchTextBox.Focus();
    }

    private void GlobalSearchTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        var text = GlobalSearchTextBox.Text;
        if (GlobalSearchPlaceholder != null)
        {
            GlobalSearchPlaceholder.Visibility = string.IsNullOrEmpty(text) ? Visibility.Visible : Visibility.Collapsed;
        }
        if (GlobalSearchClearButton != null)
        {
            GlobalSearchClearButton.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
        }
        _searchDebounceTimer.Stop();
        _searchDebounceTimer.Start();
    }

    private async void SearchDebounceTimer_Tick(object? sender, EventArgs e)
    {
        _searchDebounceTimer.Stop();
        var query = GlobalSearchTextBox.Text.Trim();
        
        var contacts = _contacts.ToList();
        var callHistory = _callHistory.ToList();
        
        var result = await Task.Run(() => 
        {
            return new 
            {
                FilteredContacts = FilterContacts(contacts, query).ToList(),
                FilteredFavorites = FilterFavorites(contacts, query).ToList(),
                FilteredCalls = FilterCalls(callHistory, query).ToList()
            };
        });
        
        ReplaceCollection(_filteredDirectoryContacts, result.FilteredContacts);
        ReplaceCollection(_filteredPhonebookContacts, result.FilteredContacts);
        ReplaceCollection(_filteredDirectoryFavorites, result.FilteredFavorites);
        ReplaceCollection(_filteredRecentCalls, result.FilteredCalls);
        ReplaceCollection(_filteredCallHistory, result.FilteredCalls);
        FilterChatContacts();
        
        ApplyGlobalSearchNavigation();
    }

    private void ApplyGlobalSearchNavigation()
    {
        var query = GlobalSearchTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            return;
        }

        MainTabs.SelectedItem = PhoneTab;
        if (_filteredDirectoryContacts.Count > 0)
        {
            DirectoryTabs.SelectedItem = DirectoryContactsTab;
        }
        else
        {
            DirectoryTabs.SelectedItem = DirectoryHistoryTab;
        }

        if (IsDialableSearch(query))
        {
            DestinationTextBox.Text = NormalizeDialDestination(query);
        }
    }

    private static bool IsDialableSearch(string query)
    {
        return query.All(character => char.IsDigit(character) || character is '+' or '*' or '#' or ' ' or '-' or '(' or ')');
    }

    private void GlobalSearchTextBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != Key.Enter)
        {
            return;
        }

        e.Handled = true;
        var query = GlobalSearchTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            DestinationTextBox.Focus();
            return;
        }

        var normalized = NormalizeDialDestination(query);
        var firstContact = _filteredDirectoryContacts.FirstOrDefault()
            ?? _filteredPhonebookContacts.FirstOrDefault();
        var firstCall = _filteredRecentCalls.FirstOrDefault()
            ?? _filteredCallHistory.FirstOrDefault();

        if (query.Any(char.IsLetter) && firstContact is not null)
        {
            UseSelectedContact(firstContact);
        }
        else if (query.Any(char.IsLetter) && firstCall is not null)
        {
            DestinationTextBox.Text = firstCall.Number;
            MainTabs.SelectedItem = PhoneTab;
        }
        else
        {
            DestinationTextBox.Text = string.IsNullOrWhiteSpace(normalized) ? query : normalized;
        }

        MainTabs.SelectedItem = PhoneTab;
        DialButton_Click(sender, e);
    }

    private void PresenceButton_Click(object sender, RoutedEventArgs e)
    {
        if (PresenceContextMenu != null)
        {
            PresenceContextMenu.PlacementTarget = UserPresencePill ?? (UIElement)sender;
            PresenceContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Custom;
            PresenceContextMenu.CustomPopupPlacementCallback = PositionPresenceContextMenu;
            PresenceContextMenu.IsOpen = true;
        }
    }

    private void UserPresencePill_MouseDown(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        if (PresenceContextMenu != null)
        {
            PresenceContextMenu.PlacementTarget = UserPresencePill;
            PresenceContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Custom;
            PresenceContextMenu.CustomPopupPlacementCallback = PositionPresenceContextMenu;
            PresenceContextMenu.IsOpen = true;
        }
    }

    private System.Windows.Controls.Primitives.CustomPopupPlacement[] PositionPresenceContextMenu(System.Windows.Size popupSize, System.Windows.Size targetSize, System.Windows.Point offset)
    {
        double pWidth = popupSize.Width > 0 ? popupSize.Width : (PresenceContextMenu?.ActualWidth > 0 ? PresenceContextMenu.ActualWidth : 190);
        double tWidth = targetSize.Width > 0 ? targetSize.Width : (UserPresencePill?.ActualWidth > 0 ? UserPresencePill.ActualWidth : 130);
        double tHeight = targetSize.Height > 0 ? targetSize.Height : (UserPresencePill?.ActualHeight > 0 ? UserPresencePill.ActualHeight : 38);

        // Align the right edge of the popup with the right edge of UserPresencePill
        // so it opens tucked inside the window rather than overflowing off the side onto the desktop.
        double x = tWidth - pWidth;
        double y = tHeight + 6;

        try
        {
            if (UserPresencePill != null && IsLoaded && ActualWidth > 0)
            {
                var pillInWindow = UserPresencePill.TransformToAncestor(this).Transform(new System.Windows.Point(0, 0));
                double maxWindowRight = ActualWidth - 16;
                double pillRight = pillInWindow.X + tWidth;
                if (pillRight > maxWindowRight)
                {
                    double excess = pillRight - maxWindowRight;
                    x -= excess;
                }
            }
        }
        catch
        {
            // Fallback to tWidth - pWidth if visual tree transform is not available
        }

        return new[]
        {
            new System.Windows.Controls.Primitives.CustomPopupPlacement(
                new System.Windows.Point(x, y),
                System.Windows.Controls.Primitives.PopupPrimaryAxis.Horizontal),
            new System.Windows.Controls.Primitives.CustomPopupPlacement(
                new System.Windows.Point(0, y),
                System.Windows.Controls.Primitives.PopupPrimaryAxis.Horizontal)
        };
    }

    private void UpdateMainPresenceDisplayOnly(string status)
    {
        if (HeaderPresenceText != null)
        {
            HeaderPresenceText.Text = status;
        }
        if (PresenceText != null)
        {
            PresenceText.Text = status;
        }
        var colour = status.ToLowerInvariant() switch
        {
            "available" => "#10B981",
            "away" or "appear away" => "#10B981",
            "busy" => "#EF4444",
            "dnd" or "do not disturb" => "#DC2626",
            "offline" or "appear offline" => "#94A3B8",
            _ => "#10B981"
        };
        var isOffline = status.Equals("Offline", StringComparison.OrdinalIgnoreCase) || status.Equals("Appear Offline", StringComparison.OrdinalIgnoreCase);
        var brush = (WpfBrush)new BrushConverter().ConvertFromString(colour)!;
        if (PresenceDot != null)
        {
            PresenceDot.Fill = brush;
            PresenceDot.Visibility = isOffline ? Visibility.Collapsed : Visibility.Visible;
        }
        if (HeaderPresenceDot != null)
        {
            HeaderPresenceDot.Fill = brush;
            HeaderPresenceDot.Visibility = isOffline ? Visibility.Collapsed : Visibility.Visible;
        }
        if (HeaderPresenceText != null)
        {
            HeaderPresenceText.Foreground = isOffline
                ? (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!
                : (WpfBrush)new BrushConverter().ConvertFromString(colour)!;
        }
    }

    private void SetPresenceDisplay(string status)
    {
        UpdateMainPresenceDisplayOnly(status);
        PublishCurrentPresence();
    }

    private void PublishCurrentPresence()
    {
        if (!_registered)
        {
            return;
        }

        var status = PresenceText.Text;
        _ = Task.Run(async () =>
        {
            try
            {
                await _sipRegistrationService.PublishPresenceAsync(status);
            }
            catch (Exception ex)
            {
                DebugLog.Write($"Error publishing presence: {ex.Message}");
            }
        });
    }

    private async void PresenceMenuItem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.MenuItem item)
        {
            return;
        }

        var status = (item.Tag as string) ?? (item.Header as string);
        if (string.IsNullOrWhiteSpace(status))
        {
            return;
        }

        _userSelectedPresence = status;

        if (status.Equals("DND", StringComparison.OrdinalIgnoreCase))
        {
            if (!_dndEnabled)
            {
                await SetDndModeInternalAsync(true, "DND");
            }
            else
            {
                SetPresenceDisplay("DND");
                _ = _sipRegistrationService.NotifyOffHookStatusAsync(true, SipRegistrationService.BusyHereStatus);
            }

            FooterStatusText.Text = "Do not disturb is on.";
            return;
        }

        if (_dndEnabled)
        {
            await SetDndModeInternalAsync(false, status);
        }
        else
        {
            SetPresenceDisplay(status);
            if (status.Equals("Busy", StringComparison.OrdinalIgnoreCase))
            {
                _ = _sipRegistrationService.NotifyOffHookStatusAsync(true, SipRegistrationService.BusyHereStatus);
            }
            else if (status.Equals("Available", StringComparison.OrdinalIgnoreCase))
            {
                _ = _sipRegistrationService.NotifyOffHookStatusAsync(false, "Phone is on the hook and available");
            }
        }

        FooterStatusText.Text = $"Presence set to {status}.";
    }

    private async void DialpadButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not WpfButton button)
        {
            return;
        }

        char digit = ' ';
        if (button.Tag is string tagStr && tagStr.Length > 0)
        {
            digit = tagStr[0];
        }
        else if (button.Content is string contentStr && contentStr.Length > 0)
        {
            digit = contentStr[0];
        }

        if (digit == ' ')
        {
            return;
        }

        // Audibly play simulated DTMF tone through the selected audio output device
        DtmfTonePlayer.Play(digit, _config.AudioOutput);

        if (_callConnected)
        {
            var result = await _sipRegistrationService.SendDtmfAsync(digit, _selectedLine);
            FooterStatusText.Text = result.Signalled
                ? $"Sent tone {digit}."
                : result.Message;
            return;
        }

        DestinationTextBox.Text += digit;
        DestinationTextBox.CaretIndex = DestinationTextBox.Text.Length;
    }

    private async Task LoadChatMessagesAsync()
    {
        _chatMessages.Clear();
        foreach (var message in await _chatMessageStore.LoadAsync())
        {
            _chatMessages.Add(message);
        }

        RefreshChatThread();
    }

    private static string NormalizeDialDestination(string value)
    {
        var trimmed = value.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return "";
        }

        var builder = new System.Text.StringBuilder(trimmed.Length);
        foreach (var character in trimmed)
        {
            if (char.IsDigit(character) || character is '*' or '#')
            {
                builder.Append(character);
            }
        }

        return builder.Length > 0 ? builder.ToString() : trimmed;
    }

    private DateTimeOffset _lastCallFinishedAt = DateTimeOffset.MinValue;

    private async void DialButton_Click(object sender, RoutedEventArgs e)
    {
        await StartOutboundCallAsync(DestinationTextBox.Text);
    }

    private async Task StartOutboundCallAsync(string rawNumber, bool isVideo = false)
    {
        if (DateTimeOffset.Now - _lastSettingsSavedAt < TimeSpan.FromSeconds(2) || SettingsOverlay.Visibility == Visibility.Visible)
        {
            DebugLog.Write("StartOutboundCallAsync rejected: settings were saved recently or settings dialog is open.");
            return;
        }
        var destinationPreview = NormalizeDialDestination(rawNumber);
        if (isVideo && destinationPreview.StartsWith('*'))
        {
            isVideo = false;
        }
        _currentCallIsVideo = isVideo;

        var targetLine = _selectedLine == 1 ? _line1 : _line2;
        if (targetLine.HasCall)
        {
            NoticeText.Text = $"Line {_selectedLine} already has an active call.";
            return;
        }

        if (_incomingRinging)
        {
            NoticeText.Text = "An incoming call is ringing.";
            return;
        }

        if (DateTimeOffset.Now - _lastCallFinishedAt < TimeSpan.FromMilliseconds(250))
        {
            NoticeText.Text = "Please wait a moment before placing another call.";
            return;
        }

        var otherLine = _selectedLine == 1 ? _line2 : _line1;
        if (otherLine.HasCall && !otherLine.IsHeld)
        {
            await HoldLine(otherLine.LineNumber);
        }

        var destination = NormalizeDialDestination(rawNumber);
        if (string.IsNullOrWhiteSpace(destination))
        {
            NoticeText.Text = "Enter a number first.";
            return;
        }

        DestinationTextBox.Text = destination;
        _lastDialedNumber = destination;
        DebugLog.Write($"UI dial requested line={_selectedLine} destination={destination}");

        var contact = _contactStore.FindByNumber(_contacts, destination);
        var name = contact?.Name ?? destination;
        StopLocalRingback();
        _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
        NoticeText.Text = $"Calling {name} on Line {_selectedLine}.";
        _activeCallStartedAt = DateTimeOffset.Now;
        _activeCallDirection = "Outbound";
        _activeRemoteNumber = destination;
        _callInProgress = true;
        _callConnected = false;
        if (_selectedLine == 1)
        {
            _line1.Status = "Calling";
            _line1.RemoteNumber = destination;
            _line1.RemoteName = name;
            _line1.Direction = "Outbound";
            _line1.IsHeld = false;
        }
        else
        {
            _line2.Status = "Calling";
            _line2.RemoteNumber = destination;
            _line2.RemoteName = name;
            _line2.Direction = "Outbound";
            _line2.IsHeld = false;
        }
        UpdateLineAppearances();
        _ = _sipRegistrationService.PublishPresenceAsync("Busy");
        SetPresenceDisplay("Busy");
        ShowDialingCallTimer();
        UpdateCallControls();

        try
        {
            _sipRegistrationService.SetSelectedLine(_selectedLine);
            if (isVideo)
            {
                if (_selectedLine == 1) Line1VideoBadge.Visibility = Visibility.Visible;
                else Line2VideoBadge.Visibility = Visibility.Visible;
            }
            var result = await _sipRegistrationService.InviteLineAsync(_selectedLine, destination, isVideo: isVideo);
            FooterStatusText.Text = result.Message;
            if (!result.Signalled)
            {
                NoticeText.Text = result.Message;
                _ = ResetFailedCallDisplayAsync(result.Message);

                string state = "Failed";
                if (result.Message.Contains("603")) state = "Declined";
                else if (result.Message.Contains("486")) state = "Busy";
                else if (result.Message.Contains("487")) state = "Cancelled";

                await OnCallFinished(state, result.Message);
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"StartOutboundCallAsync error={error}");
            NoticeText.Text = "Call failed to connect.";
            await OnCallFinished("Failed", error.Message);
        }
    }

    private async void HangupButton_Click(object sender, RoutedEventArgs e)
    {
        var result = await _sipRegistrationService.EndCallAsync();
        NoticeText.Text = "Call ended.";
        FooterStatusText.Text = result.Message;
        
        string state = "Ended";
        if (!_callConnected)
        {
            state = _activeCallDirection == "Outbound" ? "No Answer" : "Declined";
        }
        await OnCallFinished(state, result.Message);
    }

    private void AnswerIncomingCallButton_Click(object sender, RoutedEventArgs e)
    {
        AnswerIncomingCall();
    }

    private void DeclineIncomingCallButton_Click(object sender, RoutedEventArgs e)
    {
        DeclineIncomingCall();
    }

    private async void AnswerIncomingCall()
    {
        try
        {
            StopLocalRingback();
            _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
            HideIncomingCallSurfaces();
        FlashWindow(false);
            MainTabs.SelectedItem = PhoneTab;
            WindowState = WindowState.Normal;
            Activate();

            _currentCallIsVideo = _incomingCallIsVideo;
            var result = await _sipRegistrationService.AnswerIncomingCallAsync();
            FooterStatusText.Text = result.Message;
            NoticeText.Text = result.Signalled ? "Call answered." : result.Message;
            _incomingRinging = false;
            _callInProgress = result.Signalled;
            _callConnected = result.Signalled;
            if (result.Signalled)
            {
                if (_selectedLine == 2)
                {
                    _line2.Status = "Connected";
                    _line2.ConnectedAt = DateTimeOffset.Now;
                    _line2.IsHeld = false;
                }

                StartCallTimer();
                UpdateLineAppearances();
            }
            else
            {
                _activeRemoteNumber = "";
            }
            UpdateCallControls();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Error answering incoming call: {ex.Message}");
            NoticeText.Text = "Failed to answer call.";
            FooterStatusText.Text = "An error occurred while answering the call.";
            _incomingRinging = false;
            _callInProgress = false;
            _callConnected = false;
            _currentCallIsVideo = false;
            Line1VideoBadge.Visibility = Visibility.Collapsed;
            Line2VideoBadge.Visibility = Visibility.Collapsed;
            try { _videoCallWindow?.Close(); } catch { }
            _videoCallWindow = null;
            SetQueueRingingState(false);
            UpdateCallControls();
        }
    }

    private async void DeclineIncomingCall()
    {
        var result = await _sipRegistrationService.EndCallAsync();
        NoticeText.Text = "Incoming call declined.";
        FooterStatusText.Text = result.Message;
        await OnCallFinished("Declined", result.Message);
    }

    private void ClearDialpadAfterCall()
    {
        DestinationTextBox.Text = string.Empty;
        DestinationPreviewText.Text = "Enter number";
        CallerLookupText.Text = "No contact selected";
    }

    private void ClearDestinationButton_Click(object sender, RoutedEventArgs e)
    {
        DestinationTextBox.Text = string.Empty;
        DestinationTextBox.Focus();
    }

    private void DestinationTextBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            e.Handled = true;
            DialButton_Click(sender, e);
        }
    }

    private void ContactsListView_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        e.Handled = true;
        if (sender is WpfListBox listBox)
        {
            var item = GetClickedListBoxItem(listBox, e);
            if (item?.DataContext is ContactEntry contact)
            {
                CallContact(contact);
            }
        }
    }

    private void MuteButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_sipRegistrationService.CanControlAudio)
        {
            FooterStatusText.Text = "Connect a call before muting.";
            return;
        }

        _muted = !_muted;
        _sipRegistrationService.SetMuted(_muted);
        UpdateInCallButtonIcons();
        _videoCallWindow?.SyncMicrophone(_muted);
        FooterStatusText.Text = _muted ? "Microphone muted." : "Microphone unmuted.";
    }

    private async void HoldButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_sipRegistrationService.CanControlAudio)
        {
            FooterStatusText.Text = "Connect a call before using hold.";
            return;
        }

        var nextHeld = !_held;
        HoldButton.IsEnabled = false;
        var result = await _sipRegistrationService.SetHeldAsync(nextHeld);
        HoldButton.IsEnabled = true;
        if (!result.Signalled)
        {
            FooterStatusText.Text = result.Message;
            return;
        }

        _held = nextHeld;
        UpdateInCallButtonIcons();
        FooterStatusText.Text = _held
            ? "Call is on hold. PBX hold music will be used if enabled."
            : "Call resumed.";
    }

    private async void ConferenceButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_sipRegistrationService.CanControlAudio)
        {
            FooterStatusText.Text = "Connect a call before using conference.";
            return;
        }

        var favorites = _config.ShowFavouriteExtensionsOnTransfer ? _contacts.Where(c => c.IsFavorite) : null;
        var conferenceWindow = new TransferCallWindow(DestinationTextBox.Text, favorites)
        {
            Owner = this,
            Title = "Add to conference"
        };

        if (conferenceWindow.ShowDialog() != true)
        {
            return;
        }

        var target = NormalizeDialDestination(conferenceWindow.TransferTarget);
        if (string.IsNullOrWhiteSpace(target))
        {
            FooterStatusText.Text = "Enter a number to conference in.";
            return;
        }

        var result = await _sipRegistrationService.ConsultativeTransferAsync(target);
        if (result.Signalled)
        {
            result = await _sipRegistrationService.MergeConferenceAsync();
        }
        FooterStatusText.Text = result.Message;
        if (result.Signalled)
        {
            NoticeText.Text = "Conference call in progress.";
        }
    }

    private async void TransferButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            TransferButton.IsEnabled = false;
            if (_sipRegistrationService.IsConferenceActive && !_sipRegistrationService.IsConferenceMerged)
            {
                FooterStatusText.Text = "Completing assisted transfer.";
                var completeResult = await _sipRegistrationService.CompleteAssistedTransferAsync();
                FooterStatusText.Text = completeResult.Message;
                if (completeResult.Signalled)
                {
                    _muted = false;
                    _held = false;
                    UpdateInCallButtonIcons();
                    _callInProgress = false;
                    _callConnected = false;
                    StopCallTimer();
                    ClearDialpadAfterCall();
                    SetPresenceDisplay(_userSelectedPresence);
                }
                return;
            }

            var favorites = _config.ShowFavouriteExtensionsOnTransfer ? _contacts.Where(c => c.IsFavorite) : null;
            var transferWindow = new TransferCallWindow(DestinationTextBox.Text, favorites)
            {
                Owner = this
            };

            if (transferWindow.ShowDialog() != true)
            {
                return;
            }

            var target = NormalizeDialDestination(transferWindow.TransferTarget);
            if (string.IsNullOrWhiteSpace(target))
            {
                FooterStatusText.Text = "Enter a number to transfer to.";
                return;
            }

            var result = transferWindow.AssistedTransfer
                ? await _sipRegistrationService.ConsultativeTransferAsync(target)
                : await _sipRegistrationService.TransferAsync(target);
            FooterStatusText.Text = result.Message;
            if (result.Signalled && transferWindow.AssistedTransfer)
            {
                UpdateInCallButtonIcons();
                NoticeText.Text = "Assisted transfer in progress.";
                FooterStatusText.Text = "Speak to the third party, then press Transfer again to complete.";
                UpdateCallControls();
            }
            else if (result.Signalled)
            {
                _muted = false;
                _held = false;
                UpdateInCallButtonIcons();
                _callInProgress = false;
                _callConnected = false;
                StopCallTimer();
                ClearDialpadAfterCall();
                SetPresenceDisplay(_userSelectedPresence);
                UpdateCallControls();
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"UI transfer failed error={error}");
            FooterStatusText.Text = "Transfer failed. Check debug.log for details.";
        }
        finally
        {
            UpdateCallControls();
        }
    }

    private void ApplyDndMode()
    {
        _dndEnabled = string.Equals(_config.DndMode, "Reject calls", StringComparison.OrdinalIgnoreCase);
        _sipRegistrationService.SetRejectIncomingCalls(_dndEnabled);
// DndButton removed from dialer
        if (_dndEnabled)
        {
            SetPresenceDisplay("DND");
        }
        else if (string.Equals(PresenceText.Text, "DND", StringComparison.OrdinalIgnoreCase))
        {
            var restore = !string.IsNullOrWhiteSpace(_userSelectedPresence) && !string.Equals(_userSelectedPresence, "DND", StringComparison.OrdinalIgnoreCase)
                ? _userSelectedPresence
                : "Available";
            _userSelectedPresence = restore;
            SetPresenceDisplay(restore);
        }
    }


    private void VoicemailButton_Click(object sender, RoutedEventArgs e)
    {
        if (_licenseLocked || !_registered || _callInProgress || _incomingRinging)
        {
            return;
        }

        DestinationTextBox.Text = string.IsNullOrWhiteSpace(_config.VoicemailNumber) ? DeskPhone.Voicemail : _config.VoicemailNumber;
        DialButton_Click(sender, e);
    }

    private void GroupPickupButton_Click(object sender, RoutedEventArgs e)
    {
        if (_callConnected)
        {
            FooterStatusText.Text = "Group pickup is used when the phone is idle.";
            return;
        }

        DestinationTextBox.Text = string.IsNullOrWhiteSpace(_config.CallPickupPrefix) ? DeskPhone.GroupPickup : _config.CallPickupPrefix;
        DialButton_Click(sender, e);
    }

    private async void ParkButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_callConnected)
        {
            FooterStatusText.Text = "Park is used during a call. The PBX announces the parking slot.";
            return;
        }

        var result = await _sipRegistrationService.SendDtmfSequenceAsync(DeskPhone.Park, _selectedLine);
        FooterStatusText.Text = result.Signalled
            ? "Park code *6 sent. Listen for the parking slot, then dial that slot from another phone."
            : result.Message;
    }

    private void IntercomButton_Click(object sender, RoutedEventArgs e)
    {
        if (_callConnected)
        {
            FooterStatusText.Text = "Intercom is used when the phone is idle.";
            return;
        }

        var extension = DeskPhone.Digits(DestinationTextBox.Text);
        if (extension.Length == 0)
        {
            FooterStatusText.Text = "Enter an extension, then press Intercom.";
            return;
        }

        DestinationTextBox.Text = DeskPhone.IntercomTo(extension);
        DialButton_Click(sender, e);
    }

    private void ForwardAllButton_Click(object sender, RoutedEventArgs e)
    {
        if (_callConnected)
        {
            FooterStatusText.Text = "Call forward is set when the phone is idle.";
            return;
        }

        DestinationTextBox.Text = DeskPhone.ForwardAllTo(DestinationTextBox.Text);
        DialButton_Click(sender, e);
    }

    private void RedialLastButton_Click(object sender, RoutedEventArgs e)
    {
        var last = _callHistory.FirstOrDefault(call =>
            call.Direction.Equals("Outbound", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(call.Number));
        if (last is null)
        {
            FooterStatusText.Text = "There is no number to redial.";
            return;
        }

        RedialCall(last);
    }

    private async void RecordButton_Click(object sender, RoutedEventArgs e)
    {
        if (_licenseLocked || !_callConnected)
        {
            return;
        }

        var target = !string.IsNullOrWhiteSpace(_activeRemoteNumber) ? _activeRemoteNumber : "Call";
        var (active, pathOrMsg) = _sipRegistrationService.ToggleCallRecording(target);
        var recordCode = string.IsNullOrWhiteSpace(_config.CallRecordingCode) ? DeskPhone.OneTouchRecord : _config.CallRecordingCode;
        var pbx = await _sipRegistrationService.SendDtmfSequenceAsync(recordCode, _selectedLine);
        if (active)
        {
            RecordButton.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(239, 68, 68));
            SetIconButton(RecordButton, RecordIcon, "Stop recording");
            FooterStatusText.Text = pbx.Signalled
                ? $"Recording locally and sent {recordCode} to the PBX."
                : $"Recording call to {System.IO.Path.GetFileName(pathOrMsg)}";
        }
        else
        {
            RecordButton.ClearValue(WpfButton.ForegroundProperty);
            SetIconButton(RecordButton, RecordIcon, "Record Call");
            FooterStatusText.Text = pbx.Signalled
                ? $"Local recording stopped. Sent {recordCode} to the PBX."
                : pathOrMsg;
        }
    }

    private void SipRegistrationService_VoicemailStatusChanged(object? sender, VoicemailStatus e)
    {
        Dispatcher.Invoke(() =>
        {
            _hasVoicemailWaiting = e.HasMessages && (e.NewMessages > 0 || e.OldMessages > 0);
            VoicemailButtonText.Text = "Voicemail";
            if (_hasVoicemailWaiting)
            {
                var count = e.NewMessages > 0 ? e.NewMessages : e.OldMessages;
                VoicemailBadge.Visibility = Visibility.Visible;
                VoicemailButton.ToolTip = count > 1 ? $"{count} voicemail messages waiting" : "New voicemail waiting";
                StartVoicemailFlashing();
            }
            else
            {
                StopVoicemailFlashing();
                VoicemailBadge.Visibility = Visibility.Collapsed;
                VoicemailButton.ToolTip = "Voicemail";
            }
        });
    }

    private void StartVoicemailFlashing()
    {
        if (_voicemailFlashTimer is null)
        {
            _voicemailFlashTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(800) };
            _voicemailFlashTimer.Tick += (_, _) =>
            {
                if (!_hasVoicemailWaiting)
                {
                    StopVoicemailFlashing();
                    return;
                }
                _voicemailFlashToggle = !_voicemailFlashToggle;
                VoicemailBadge.Opacity = _voicemailFlashToggle ? 1.0 : 0.25;
            };
        }
        if (!_voicemailFlashTimer.IsEnabled)
        {
            _voicemailFlashToggle = true;
            VoicemailBadge.Opacity = 1.0;
            _voicemailFlashTimer.Start();
        }
    }

    private void StopVoicemailFlashing()
    {
        _voicemailFlashTimer?.Stop();
        _voicemailFlashToggle = false;
        VoicemailBadge.Opacity = 1.0;
        VoicemailBadge.Visibility = Visibility.Collapsed;
        VoicemailButton.ClearValue(WpfButton.BackgroundProperty);
        VoicemailButton.ClearValue(WpfButton.ForegroundProperty);
        VoicemailButton.ClearValue(WpfButton.BorderBrushProperty);
    }

        private async Task ToggleDndAsync()
    {
        var targetDnd = !_dndEnabled;
        var targetPresence = targetDnd
            ? "DND"
            : (!string.IsNullOrWhiteSpace(_userSelectedPresence) && !string.Equals(_userSelectedPresence, "DND", StringComparison.OrdinalIgnoreCase)
                ? _userSelectedPresence
                : "Available");

        await SetDndModeInternalAsync(targetDnd, targetPresence);
    }



    private async Task SetDndModeInternalAsync(bool enableDnd, string targetPresence)
    {
        _dndEnabled = enableDnd;
        _config = _config with { DndMode = _dndEnabled ? "Reject calls" : "Off" };
        SelectComboBoxItem(DndModeComboBox, _config.DndMode);
        await _cacheService.SaveSettingsAsync(_config.WithFixedSipEndpoint());
        _sipRegistrationService.SetRejectIncomingCalls(_dndEnabled);

        if (_dndEnabled)
        {
            _ringtonePlayer.Stop();
            _secondaryRingtonePlayer.Stop();
            if (_sipRegistrationService.HasPendingIncomingCall)
            {
                var result = await _sipRegistrationService.EndCallAsync();
                HideIncomingCallSurfaces();
                FlashWindow(false);
                FooterStatusText.Text = result.Message;
                _incomingRinging = false;
                _callInProgress = false;
                _callConnected = false;
                UpdateCallControls();
            }
        }

        UpdateDndUi();
        _userSelectedPresence = targetPresence;
        SetPresenceDisplay(targetPresence);
        _ = _sipRegistrationService.NotifyOffHookStatusAsync(_dndEnabled, _dndEnabled ? SipRegistrationService.BusyHereStatus : "Phone is on the hook and available");
        UpdateCallControls();

        if (!_dndEnabled && !_registered && NetworkInterface.GetIsNetworkAvailable())
        {
            FooterStatusText.Text = "Reconnecting after do not disturb.";
            await RegisterSipAsync();
        }

        if (!_callInProgress && !_callConnected && !_incomingRinging)
        {
            await StartOutboundCallAsync(_dndEnabled ? DeskPhone.DndOn : DeskPhone.DndOff);
        }
    }

    private void UseSelectedContactButton_Click(object sender, RoutedEventArgs e)
    {
        var contact = MainTabs.SelectedItem == ContactsTab
            ? PhonebookContactsListView.SelectedItem as ContactEntry
            : DialContactsListView.SelectedItem as ContactEntry;

        if (contact is not null)
        {
            UseSelectedContact(contact);
        }
    }

    private void UseSelectedContact(ContactEntry contact)
    {
        DestinationTextBox.Text = contact.Number;
        MainTabs.SelectedItem = PhoneTab;
        NoticeText.Text = $"Ready to call {contact.Name}.";
    }

    private async void CallContact(ContactEntry contact)
    {
        UseSelectedContact(contact);
        await StartOutboundCallAsync(contact.BlfDialNumber);
    }

    private void PhonebookContactsListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (PhonebookContactsListView.SelectedItem is not ContactEntry contact)
        {
            _editingContact = null;
            return;
        }

        _editingContact = contact;
        ContactNameTextBox.Text = contact.Name;
        ContactNumberTextBox.Text = contact.Number;
        ContactCompanyTextBox.Text = contact.Company;
        ContactNotesTextBox.Text = contact.Notes;
        ContactIsFavoriteCheckBox.IsChecked = contact.IsFavorite;
        FooterStatusText.Text = $"Editing {contact.Name}.";
    }

    private static ListBoxItem? GetClickedListBoxItem(WpfListBox listBox, MouseButtonEventArgs e)
    {
        var dep = e.OriginalSource as DependencyObject;
        while (dep != null && dep != listBox)
        {
            if (dep is ListBoxItem item)
            {
                return item;
            }
            dep = VisualTreeHelper.GetParent(dep);
        }
        return null;
    }

    private void RecentCallsListView_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        e.Handled = true;
        var item = GetClickedListBoxItem(RecentCallsListView, e);
        if (item?.DataContext is CallHistoryEntry call)
        {
            RedialCall(call);
        }
    }

    private void CallHistoryListView_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        var item = GetClickedListBoxItem(CallHistoryListView, e);
        if (item?.DataContext is CallHistoryEntry call)
        {
            RedialCall(call);
        }
    }

    private async void RedialCall(CallHistoryEntry call)
    {
        if (DateTimeOffset.Now - _lastSettingsSavedAt < TimeSpan.FromSeconds(2) || SettingsOverlay.Visibility == Visibility.Visible)
        {
            return;
        }

        DestinationTextBox.Text = call.Number;
        MainTabs.SelectedItem = PhoneTab;
        NoticeText.Text = $"Calling {call.Name}.";
        await StartOutboundCallAsync(call.Number);
    }

    private async void SaveContactButton_Click(object sender, RoutedEventArgs e)
    {
        var name = ContactNameTextBox.Text.Trim();
        var number = ContactNumberTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(number))
        {
            FooterStatusText.Text = "Name and number are required.";
            return;
        }

        var savedContact = new ContactEntry
        {
            Name = name,
            Number = number,
            Company = ContactCompanyTextBox.Text.Trim(),
            Notes = ContactNotesTextBox.Text.Trim(),
            IsFavorite = ContactIsFavoriteCheckBox.IsChecked == true
        };

        var updateIndex = -1;
        if (_editingContact is not null &&
            string.Equals(_editingContact.Number, number, StringComparison.OrdinalIgnoreCase))
        {
            updateIndex = IndexOfContact(_editingContact);
        }

        if (updateIndex < 0)
        {
            updateIndex = IndexOfContactNumber(number);
        }

        if (updateIndex >= 0)
        {
            savedContact = savedContact with { Presence = _contacts[updateIndex].Presence };
            _contacts[updateIndex] = savedContact;
        }
        else
        {
            _contacts.Add(savedContact);
        }

        await _contactStore.SaveAsync(_contacts);
        PhonebookContactsListView.SelectedItem = null;
        _editingContact = null;
        ContactNameTextBox.Text = "";
        ContactNumberTextBox.Text = "";
        ContactCompanyTextBox.Text = "";
        ContactNotesTextBox.Text = "";
        ContactIsFavoriteCheckBox.IsChecked = false;
        ApplyGlobalSearchFilter();
        NoticeText.Text = $"Contact saved. {_contacts.Count} contacts.";
        NoticeText.Visibility = Visibility.Visible;
        FooterStatusText.Text = NoticeText.Text;
        _ = RefreshPresenceSubscriptionsAsync();
    }

    private async void DeleteContactButton_Click(object sender, RoutedEventArgs e)
    {
        if (PhonebookContactsListView.SelectedItem is not ContactEntry contact)
        {
            FooterStatusText.Text = "Select a contact first.";
            return;
        }

        var deleteIndex = IndexOfContact(contact);
        if (deleteIndex >= 0)
        {
            _contacts.RemoveAt(deleteIndex);
        }
        await _contactStore.SaveAsync(_contacts);
        _editingContact = null;
        ContactNameTextBox.Text = "";
        ContactNumberTextBox.Text = "";
        ContactCompanyTextBox.Text = "";
        ContactNotesTextBox.Text = "";
        ContactIsFavoriteCheckBox.IsChecked = false;
        ApplyGlobalSearchFilter();
        FooterStatusText.Text = "Contact deleted.";
    }

    private int IndexOfContact(ContactEntry contact)
    {
        for (var index = 0; index < _contacts.Count; index++)
        {
            if (ReferenceEquals(_contacts[index], contact))
            {
                return index;
            }
        }

        if (string.IsNullOrWhiteSpace(contact.Number))
        {
            return -1;
        }

        for (var index = 0; index < _contacts.Count; index++)
        {
            if (string.Equals(_contacts[index].Number, contact.Number, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(_contacts[index].Name, contact.Name, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }

    private int IndexOfContactNumber(string number)
    {
        for (var index = 0; index < _contacts.Count; index++)
        {
            if (string.Equals(_contacts[index].Number, number, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }

    private void NewContactButton_Click(object sender, RoutedEventArgs e)
    {
        PhonebookContactsListView.SelectedItem = null;
        _editingContact = null;
        ContactNameTextBox.Text = "";
        ContactNumberTextBox.Text = "";
        ContactCompanyTextBox.Text = "";
        ContactNotesTextBox.Text = "";
        ContactIsFavoriteCheckBox.IsChecked = false;
        FooterStatusText.Text = "Ready to create a new contact.";
    }

    private async void ReconnectButton_Click(object sender, RoutedEventArgs e)
    {
        var mediaConfig = BuildConfigFromSettings();
        var server = _config.AllowsCustomSipEndpoint
            ? (!string.IsNullOrWhiteSpace(PrivatePbxSettingsTextBox.Text) ? PrivatePbxSettingsTextBox.Text.Trim() : AppStartupConfig.FixedSipServer)
            : AppStartupConfig.FixedSipServer;

        _config = _config with
        {
            Server = server,
            Port = AppStartupConfig.FixedSipPort,
            Domain = IPAddress.TryParse(server, out _) ? AppStartupConfig.FixedSipServer : server,
            Extension = ExtensionTextBox.Text.Trim(),
                Username = _config.IsProvisioned ? _config.Username : UsernameTextBox.Text.Trim(),
                Password = _config.IsProvisioned ? _config.Password : (_passwordRevealed ? PasswordTextBox.Text : PasswordBox.Password),
            AudioInput = mediaConfig.AudioInput,
            AudioOutput = mediaConfig.AudioOutput,
            Ringtone = mediaConfig.Ringtone,
            MicrophoneVolume = mediaConfig.MicrophoneVolume,
            HeadphoneVolume = mediaConfig.HeadphoneVolume,
            SipAlgCompatibilityMode = mediaConfig.SipAlgCompatibilityMode
        };
        _config = _config.WithFixedSipEndpoint();

        await _cacheService.SaveSettingsAsync(_config);
        if (_testTonePlaying)
        {
            _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
            _testTonePlaying = false;
            TestToneButton.Content = "Preview Tone";
        }
        SettingsOverlay.Visibility = Visibility.Collapsed;
        _registered = false;
        UpdateCallControls();
        await RegisterSipAsync();
    }

    private AppStartupConfig BuildConfigFromSettings()
    {
        var audioInput = AudioInputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioInput;
        var audioOutput = AudioOutputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioOutput;
        var videoSource = VideoSourceComboBox.SelectedItem as MediaDeviceInfo ?? _config.VideoSource;
        var ringtone = RingtoneComboBox.SelectedItem as RingtoneChoice;
        return _config with
        {
            Server = _config.AllowsCustomSipEndpoint ? (!string.IsNullOrWhiteSpace(PrivatePbxSettingsTextBox.Text) ? PrivatePbxSettingsTextBox.Text.Trim() : AppStartupConfig.FixedSipServer) : AppStartupConfig.FixedSipServer,
            Domain = _config.AllowsCustomSipEndpoint ? (!string.IsNullOrWhiteSpace(PrivatePbxSettingsTextBox.Text) ? PrivatePbxSettingsTextBox.Text.Trim() : AppStartupConfig.FixedSipServer) : AppStartupConfig.FixedSipServer,
            AudioInput = audioInput,
            AudioOutput = audioOutput,
            VideoSource = videoSource,
            Ringtone = ringtone?.Id ?? _config.Ringtone,
            MicrophoneVolume = Math.Clamp(MicrophoneVolumeSlider.Value / 100, 0.25, 2.0),
            HeadphoneVolume = Math.Clamp(HeadphoneVolumeSlider.Value / 100, 0.25, 2.0),
            SipAlgCompatibilityMode = SipAlgCompatibilityCheckBox.IsChecked == true,
            IgnoreSslErrors = IgnoreSslErrorsCheckBox.IsChecked == true,
            SipSignallingTransport = ComboBoxTag(SipTransportModeComboBox, AppStartupConfig.TransportUdp)
        };
    }

    private void TogglePasswordVisibility_Click(object sender, RoutedEventArgs e)
    {
        if (_config.IsProvisioned) return;
        _passwordRevealed = !_passwordRevealed;
        if (_passwordRevealed)
        {
            PasswordTextBox.Text = PasswordBox.Password;
            PasswordBox.Visibility = Visibility.Collapsed;
            PasswordTextBox.Visibility = Visibility.Visible;
            TogglePasswordButton.Content = "🔒";
            PasswordTextBox.Focus();
            PasswordTextBox.CaretIndex = PasswordTextBox.Text.Length;
        }
        else
        {
            PasswordBox.Password = PasswordTextBox.Text;
            PasswordTextBox.Visibility = Visibility.Collapsed;
            PasswordBox.Visibility = Visibility.Visible;
            TogglePasswordButton.Content = "👁";
            PasswordBox.Focus();
        }
    }

    private async void SwitchToManualConfigButton_Click(object sender, RoutedEventArgs e)
    {
        _config = _config with
        {
            IsProvisioned = false,
            Username = string.Empty,
            Password = string.Empty
        };
        ApplyStartupConfig();
        if (!string.IsNullOrWhiteSpace(_config.DataHandlerUrl))
        {
            _ = _chatService.UpdateServerUrlAsync(_config.DataHandlerUrl);
        }
        await _cacheService.SaveSettingsAsync(_config.WithFixedSipEndpoint());
        FooterStatusText.Text = "Switched to manual credentials.";
    }

    private void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (!_passwordRevealed && PasswordTextBox.Text != PasswordBox.Password)
        {
            PasswordTextBox.Text = PasswordBox.Password;
        }
    }

    private void PasswordTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_passwordRevealed && PasswordBox.Password != PasswordTextBox.Text)
        {
            PasswordBox.Password = PasswordTextBox.Text;
        }
    }


    private bool _testSpeakerPlaying;
    private bool _testSecondaryRingerPlaying;

    private void TestSpeakerButton_Click(object sender, RoutedEventArgs e)
    {
        if (_testSpeakerPlaying)
        {
            _ringtonePlayer.Stop();
            _testSpeakerPlaying = false;
            TestSpeakerButton.Content = "Test";
            return;
        }

        var output = AudioOutputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioOutput;
        _testSpeakerPlaying = true;
        TestSpeakerButton.Content = "Stop";
        _ringtonePlayer.Start(output, "skype-spark", HeadphoneVolumeSlider.Value / 100);
        _ = Task.Run(async () =>
        {
            await Task.Delay(2500);
            await Dispatcher.InvokeAsync(() =>
            {
                if (_testSpeakerPlaying)
                {
                    _ringtonePlayer.Stop();
                    _testSpeakerPlaying = false;
                    TestSpeakerButton.Content = "Test";
                }
            });
        });
    }

    private void TestSecondaryRingerButton_Click(object sender, RoutedEventArgs e)
    {
        if (_testSecondaryRingerPlaying)
        {
            _secondaryRingtonePlayer.Stop();
            _testSecondaryRingerPlaying = false;
            TestSecondaryRingerButton.Content = "Preview Ringer";
            return;
        }

        var secondary = SecondaryRingerComboBox.SelectedItem as MediaDeviceInfo ?? _config.SecondaryRingerOutput ?? _config.AudioOutput;
        var ringtone = RingtoneComboBox.SelectedItem as RingtoneChoice;
        _testSecondaryRingerPlaying = true;
        TestSecondaryRingerButton.Content = "Stop";
        _secondaryRingtonePlayer.Start(secondary, ringtone?.Id ?? _config.Ringtone, HeadphoneVolumeSlider.Value / 100);
        _ = Task.Run(async () =>
        {
            await Task.Delay(3500);
            await Dispatcher.InvokeAsync(() =>
            {
                if (_testSecondaryRingerPlaying)
                {
                    _secondaryRingtonePlayer.Stop();
                    _testSecondaryRingerPlaying = false;
                    TestSecondaryRingerButton.Content = "Preview Ringer";
                }
            });
        });
    }

    private void TestToneButton_Click(object sender, RoutedEventArgs e)
    {
        if (_testTonePlaying)
        {
            _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
            _testTonePlaying = false;
            TestToneButton.Content = "Preview Tone";
            return;
        }

        var output = AudioOutputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioOutput;
        var ringtone = RingtoneComboBox.SelectedItem as RingtoneChoice;
        _testTonePlaying = true;
        TestToneButton.Content = "Stop Tone";
        _ringtonePlayer.Start(output, ringtone?.Id ?? _config.Ringtone, HeadphoneVolumeSlider.Value / 100);
        _ = Task.Run(async () =>
        {
            await Task.Delay(5500);
            await Dispatcher.InvokeAsync(() =>
            {
                if (_testTonePlaying)
                {
                    _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
                    _testTonePlaying = false;
                    TestToneButton.Content = "Preview Tone";
                }
            });
        });
    }

    private async void ProvisionAndReconnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (_config.AllowsCustomSipEndpoint)
        {
            FooterStatusText.Text = "Auto-provisioning is not available on buyout licenses.";
            return;
        }
        ProvisionAndReconnectButton.IsEnabled = false;
        FooterStatusText.Text = "Applying account setup.";

        try
        {
            var audioInput = AudioInputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioInput;
            var audioOutput = AudioOutputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioOutput;
            var videoSource = VideoSourceComboBox.SelectedItem as MediaDeviceInfo ?? _config.VideoSource;
            var ringtone = RingtoneComboBox.SelectedItem as RingtoneChoice;

            var result = await _provisioningService.ProvisionAsync(
                SettingsProvisioningCodeTextBox.Text,
                _config.LicenseKey,
                _config.LicenseStatus,
                _config.LicenseLocalKey,
                audioInput,
                audioOutput);

            if (!result.Success || result.Config is null)
            {
                FooterStatusText.Text = result.Message;
                ServerStatusText.Text = result.Message;
                return;
            }

            _config = result.Config.WithFixedSipEndpoint() with
            {
                Ringtone = ringtone?.Id ?? _config.Ringtone,
                MicrophoneVolume = Math.Clamp(MicrophoneVolumeSlider.Value / 100, 0.25, 2.0),
                HeadphoneVolume = Math.Clamp(HeadphoneVolumeSlider.Value / 100, 0.25, 2.0),
                SipAlgCompatibilityMode = SipAlgCompatibilityCheckBox.IsChecked == true,
                SipSignallingTransport = ComboBoxTag(SipTransportModeComboBox, AppStartupConfig.TransportUdp)
            };
            ApplyStartupConfig();
        if (!string.IsNullOrWhiteSpace(_config.DataHandlerUrl))
        {
            _ = _chatService.UpdateServerUrlAsync(_config.DataHandlerUrl);
        }
            await _cacheService.SaveSettingsAsync(_config);
            SettingsProvisioningCodeTextBox.Text = string.Empty;
            SettingsOverlay.Visibility = Visibility.Collapsed;
            FooterStatusText.Text = "Account provisioned.";
            _registered = false;
            UpdateCallControls();
            await RegisterSipAsync();
        }
        finally
        {
            ProvisionAndReconnectButton.IsEnabled = true;
        }
    }

    private void ClearTransientFooterOnNav()
    {
        if (FooterStatusText != null && FooterStatusText.Text.StartsWith("Editing ", StringComparison.OrdinalIgnoreCase))
        {
            FooterStatusText.Text = "";
            if (FooterStatusBar != null && string.Equals(_viewModel.ConnectionState, "Connected", StringComparison.OrdinalIgnoreCase))
            {
                FooterStatusBar.Visibility = Visibility.Collapsed;
            }
        }
    }

    private void ShowDialButton_Click(object sender, RoutedEventArgs e)
    {
        ClearTransientFooterOnNav();
        MainTabs.SelectedItem = PhoneTab;
    }

    private void ShowContactsButton_Click(object sender, RoutedEventArgs e)
    {
        ClearTransientFooterOnNav();
        MainTabs.SelectedItem = ContactsTab;
        PhonebookContactsListView.Focus();
    }

    private void ShowDirectoryHistoryButton_Click(object sender, RoutedEventArgs e)
    {
        DirectoryTabs.SelectedItem = DirectoryHistoryTab;
        UpdateActiveDirectoryTab(DirTabHistoryBtn);
    }

    private void ShowDirectoryContactsButton_Click(object sender, RoutedEventArgs e)
    {
        DirectoryTabs.SelectedItem = DirectoryContactsTab;
        UpdateActiveDirectoryTab(DirTabContactsBtn);
    }

    private void ShowDirectoryFavoritesButton_Click(object sender, RoutedEventArgs e)
    {
        DirectoryTabs.SelectedItem = DirectoryFavoritesTab;
        UpdateActiveDirectoryTab(DirTabFavoritesBtn);
    }

    private void UpdateActiveDirectoryTab(System.Windows.Controls.Button activeBtn)
    {
        var activeBg = System.Windows.Media.Brushes.White;
        var activeFg = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#0F172A")!;
        var inactiveBg = System.Windows.Media.Brushes.Transparent;
        var inactiveFg = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#64748B")!;

        foreach (var btn in new[] { DirTabHistoryBtn, DirTabContactsBtn, DirTabFavoritesBtn })
        {
            if (btn == null) continue;
            if (btn == activeBtn)
            {
                btn.Background = activeBg;
                btn.Foreground = activeFg;
                btn.Effect = new System.Windows.Media.Effects.DropShadowEffect
                {
                    BlurRadius = 4,
                    ShadowDepth = 1,
                    Opacity = 0.08,
                    Color = System.Windows.Media.Color.FromRgb(15, 23, 42)
                };
            }
            else
            {
                btn.Background = inactiveBg;
                btn.Foreground = inactiveFg;
                btn.Effect = null;
            }
        }
    }

    private void FavoritesListView_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        e.Handled = true;
        var item = GetClickedListBoxItem(DialFavoritesListView, e);
        if (item?.DataContext is ContactEntry contact)
        {
            UseSelectedContact(contact);
        }
    }

    private void ShowCallsButton_Click(object sender, RoutedEventArgs e)
    {
        ClearTransientFooterOnNav();
        MainTabs.SelectedItem = CallsTab;
    }

    private void ShowMessagesButton_Click(object sender, RoutedEventArgs e)
    {
        ClearTransientFooterOnNav();
        MainTabs.SelectedItem = MessagesTab;
        if (string.IsNullOrWhiteSpace(_selectedChatNumber) && _contacts.Count > 0)
        {
            SelectChatContact(_contacts[0]);
        }
    }

    private async void OpenSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        if (SettingsSavedBanner != null)
        {
            SettingsSavedBanner.Visibility = Visibility.Collapsed;
        }
        SettingsOverlay.Visibility = Visibility.Visible;
        SettingsTabs.SelectedItem = SettingsGeneralTab;
        StartMicVuMeter();
        UpdateActiveSettingsTab(TabBtnGeneral);
        await RefreshConnectionDiagnosticsAsync();
        await EnsureConnectionReadyAsync();
    }

    private async void CloseSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        StopMicVuMeter();
        if (_testTonePlaying)
        {
            _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
            _testTonePlaying = false;
            TestToneButton.Content = "Preview Tone";
        }
        if (SettingsSavedBanner != null)
        {
            SettingsSavedBanner.Visibility = Visibility.Collapsed;
        }
        SettingsOverlay.IsHitTestVisible = false;
        await Task.Delay(150);
        SettingsOverlay.Visibility = Visibility.Collapsed;
        SettingsOverlay.IsHitTestVisible = true;
    }

    private void UpdateActiveSettingsTab(System.Windows.Controls.Button activeBtn)
    {
        var activeBg = (System.Windows.Media.Brush)this.FindResource("PrimaryBrush")!;
        var activeFg = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#0F172A")!;
        var inactiveBg = System.Windows.Media.Brushes.Transparent;
        var inactiveFg = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#475569")!;

        foreach (var btn in new[] { TabBtnGeneral, TabBtnAccount, TabBtnHandling, TabBtnAudio, TabBtnDiagnostics, TabBtnAbout })
        {
            if (btn == activeBtn)
            {
                btn.Background = activeBg;
                btn.Foreground = activeFg;
            }
            else
            {
                btn.Background = inactiveBg;
                btn.Foreground = inactiveFg;
            }
        }

        if (SettingsTabTitleText != null && SettingsTabSubtitleText != null)
        {
            if (activeBtn == TabBtnGeneral)
            {
                SettingsTabTitleText.Text = "General";
                SettingsTabSubtitleText.Text = "How Merlin behaves on this PC";
            }
            else if (activeBtn == TabBtnAccount)
            {
                SettingsTabTitleText.Text = "Account & SIP";
                SettingsTabSubtitleText.Text = "Extension, password, and the path to the PBX";
            }
            else if (activeBtn == TabBtnAudio)
            {
                SettingsTabTitleText.Text = "Audio & Tunes";
                SettingsTabSubtitleText.Text = "Microphone, speakers, ringtone, and camera";
            }
            else if (activeBtn == TabBtnHandling)
            {
                SettingsTabTitleText.Text = "Calls & Routing";
                SettingsTabSubtitleText.Text = "Answer, divert, dial codes, and timeouts";
            }
            else if (activeBtn == TabBtnDiagnostics)
            {
                SettingsTabTitleText.Text = "Diagnostics";
                SettingsTabSubtitleText.Text = "Connection test and support tools";
            }
            else if (activeBtn == TabBtnAbout)
            {
                SettingsTabTitleText.Text = "About";
                SettingsTabSubtitleText.Text = "Version, licence, and connection";
            }
        }
    }

    private async void SettingsAccountButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsAccountTab;
        UpdateActiveSettingsTab(TabBtnAccount);
        await RefreshConnectionDiagnosticsAsync();
        await EnsureConnectionReadyAsync();
    }

    private void SettingsGeneralButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsGeneralTab;
        UpdateActiveSettingsTab(TabBtnGeneral);
    }

    private void SettingsHandlingButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsHandlingTab;
        UpdateActiveSettingsTab(TabBtnHandling);
    }

    private void SettingsAudioButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsAudioTab;
        UpdateActiveSettingsTab(TabBtnAudio);
    }

    private void SettingsDiagnosticsButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsDiagnosticsTab;
        UpdateActiveSettingsTab(TabBtnDiagnostics);
    }

    private async void SettingsAboutButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsTabs.SelectedItem = SettingsAboutTab;
        UpdateActiveSettingsTab(TabBtnAbout);
        await RefreshConnectionDiagnosticsAsync();
    }

    private void SipAlgCompatibilityCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        UpdateNetworkAssistanceText();
    }

    private void IgnoreSslErrorsCheckBox_Changed(object sender, RoutedEventArgs e)
    {
    }

    private void SipTransportModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        UpdateNetworkAssistanceText();
    }

    private void UpdateNetworkAssistanceText()
    {
        var compatibilityOn = SipAlgCompatibilityCheckBox.IsChecked == true;
        var transport = ComboBoxTag(SipTransportModeComboBox, AppStartupConfig.TransportUdp);
        var tcpMode = string.Equals(transport, AppStartupConfig.TransportTcp, StringComparison.OrdinalIgnoreCase);
        var tlsMode = string.Equals(transport, AppStartupConfig.TransportTls, StringComparison.OrdinalIgnoreCase);

        NatKeepaliveStatusText.Text = compatibilityOn ? "On" : "Off";
        NatKeepaliveStatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString(compatibilityOn ? "#106247" : "#64748B")!;
        RportStatusText.Text = tlsMode ? "TLS" : tcpMode ? "TCP" : "On";
        AutoRecoveryStatusText.Text = "On";
    }

    private async void RunPbxDiagnosticsButton_Click(object sender, RoutedEventArgs e)
    {
        if (_networkDiagnosticsRunning)
        {
            _activeNetworkDiagnostics?.Cancel();
            RunPbxDiagnosticsButton.IsEnabled = false;
            RunPbxDiagnosticsButton.Content = "Stopping";
            PbxDiagnosticsText.Text = "Stopping network diagnostics...";
            return;
        }

        await RunNetworkDiagnosticsAsync();
    }

    private async Task RunNetworkDiagnosticsAsync()
    {
        if (_networkDiagnosticsRunning)
        {
            return;
        }

        _networkDiagnosticsRunning = true;
        _networkDiagnosticsProgress.Clear();
        RunPbxDiagnosticsButton.IsEnabled = true;
        RunPbxDiagnosticsButton.Content = "Stop";
        PbxDiagnosticsText.Text = "Starting network diagnostics...";
        FooterStatusText.Text = "Network diagnostics are running. You can keep using the phone.";
        DebugLog.Write("Network diagnostics started from Settings.");
        await Task.Yield();

        var engine = new NetworkEngine
        {
            SelectedTests = [true, true, true, true, true, true, true, true, true, true]
        };
        _activeNetworkDiagnostics = engine;
        int? finalScore = null;

        engine.OnLog += (message, isError) =>
        {
            DebugLog.Write(isError ? $"NETWORK DIAGNOSTICS ERROR: {message}" : $"NETWORK DIAGNOSTICS: {message}");
        };
        engine.OnProgress += (testName, status, details) =>
        {
            Dispatcher.InvokeAsync(() =>
            {
                try
                {
                    UpdateNetworkDiagnosticsProgress(testName, status, details);
                }
                catch
                {
                }
            });
        };
        engine.OnComplete += (_, score) =>
        {
            finalScore = score;
        };

        try
        {
            var passed = await Task.Run(async () => await engine.RunDiagnosticsAsync());
            PbxDiagnosticsText.Text = BuildNetworkDiagnosticsSummary(passed, finalScore);
            FooterStatusText.Text = passed
                ? "Network diagnostics complete."
                : "Network diagnostics found issues.";
            DebugLog.Write($"Network diagnostics completed. Passed={passed}. Score={finalScore?.ToString() ?? "n/a"}.");
        }
        catch (Exception error)
        {
            DebugLog.Write($"Network diagnostics failed: {error}");
            PbxDiagnosticsText.Text = "Network diagnostics failed. Check debug.log for details.";
            FooterStatusText.Text = "Network diagnostics failed.";
        }
        finally
        {
            try
            {
                engine.Dispose();
            }
            catch
            {
            }
            _activeNetworkDiagnostics = null;
            _networkDiagnosticsRunning = false;
            RunPbxDiagnosticsButton.Content = "Run test";
            RunPbxDiagnosticsButton.IsEnabled = true;
        }
    }

    private void UpdateNetworkDiagnosticsProgress(string testName, string status, string details)
    {
        var line = $"{testName}: {status}. {details}";
        var existingIndex = _networkDiagnosticsProgress.FindIndex(item => item.StartsWith($"{testName}:", StringComparison.OrdinalIgnoreCase));
        if (existingIndex >= 0)
        {
            _networkDiagnosticsProgress[existingIndex] = line;
        }
        else
        {
            _networkDiagnosticsProgress.Add(line);
        }

        var displayTest = GetNetworkDiagnosticDisplayTest(testName);
        PbxDiagnosticsText.Text = status == "Running" && !string.IsNullOrWhiteSpace(details)
            ? $"{displayTest.Number}/10 {displayTest.Name} - {details}"
            : $"{displayTest.Number}/10 {displayTest.Name} - {GetNetworkDiagnosticDisplayStatus(status)}";
    }

    private static (int Number, string Name) GetNetworkDiagnosticDisplayTest(string testName)
    {
        return testName switch
        {
            "DNS Domain & Resolution Check" => (1, "DNS Resolution"),
            "HTTP/HTTPS Outbound Probes" => (2, "Web Connectivity"),
            "NTP Subsystem (UDP 123)" => (3, "Time Sync"),
            "Primary STUN Servers" => (4, "PBX Reachability"),
            "Google STUN Servers" => (5, "Public STUN"),
            "NAT Routing & Hops Check" => (6, "NAT Routing"),
            "NAT Port Translation (Random Port)" => (7, "NAT Port Mapping"),
            "SIP ALG Detection" => (8, "SIP ALG"),
            "RTP Jitter/Loss Check" => (9, "Media Quality"),
            "Inbound Signalling & Presence" => (10, "Signalling Reachability"),
            _ => (1, "Network Check")
        };
    }

    private static string GetNetworkDiagnosticDisplayStatus(string status)
    {
        return status switch
        {
            "Running" => "RUNNING",
            "Passed" or "Pass" => "PASSED",
            "Failed" or "Fail" => "FAILED",
            "Skipped" => "SKIPPED",
            _ => status.ToUpperInvariant()
        };
    }

    private string BuildNetworkDiagnosticsSummary(bool passed, int? score)
    {
        var report = new StringBuilder();
        report.AppendLine(passed
            ? "Network diagnostics complete: Passed."
            : "Network diagnostics complete: Issues found.");
        if (score.HasValue)
        {
            report.AppendLine($"Weighted score: {score}/100.");
        }
        report.AppendLine("Full details are available in the diagnostic log.");
        return report.ToString().Trim();
    }




    private async void SaveAllSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        _lastSettingsSavedAt = DateTimeOffset.Now;
        SaveAllSettingsButton.IsEnabled = false;

        try
        {
            var previousInput = _config.AudioInput;
            var previousOutput = _config.AudioOutput;
            var previousTransport = _config.SipSignallingTransport;
            var previousExtension = _config.Extension;
            var previousUsername = _config.Username;
            var previousPassword = _config.Password;
            var previousServer = _config.Server;

            var audioInput = AudioInputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioInput;
            var audioOutput = AudioOutputComboBox.SelectedItem as MediaDeviceInfo ?? _config.AudioOutput;
            var videoSource = VideoSourceComboBox.SelectedItem as MediaDeviceInfo ?? _config.VideoSource;
            var ringtone = RingtoneComboBox.SelectedItem as RingtoneChoice;

            var server = _config.AllowsCustomSipEndpoint
                ? (!string.IsNullOrWhiteSpace(PrivatePbxSettingsTextBox.Text) ? PrivatePbxSettingsTextBox.Text.Trim() : AppStartupConfig.FixedSipServer)
                : AppStartupConfig.FixedSipServer;
            var dataHandlerUrl = _config.AllowsCustomSipEndpoint
                ? (!string.IsNullOrWhiteSpace(PrivateDataHandlerTextBox.Text) ? PrivateDataHandlerTextBox.Text.Trim() : AppStartupConfig.DefaultDataHandlerUrl)
                : AppStartupConfig.DefaultDataHandlerUrl;

            _config = _config with
            {
                Server = server,
                Port = AppStartupConfig.FixedSipPort,
                Domain = IPAddress.TryParse(server, out _) ? AppStartupConfig.FixedSipServer : server,
                Extension = ExtensionTextBox.Text.Trim(),
                Username = _config.IsProvisioned ? _config.Username : UsernameTextBox.Text.Trim(),
                Password = _config.IsProvisioned ? _config.Password : (_passwordRevealed ? PasswordTextBox.Text : PasswordBox.Password),
                AudioInput = audioInput,
                AudioOutput = audioOutput,
                SecondaryRingerOutput = SecondaryRingerComboBox.SelectedItem as MediaDeviceInfo ?? _config.SecondaryRingerOutput,
                VideoSource = videoSource,
                Ringtone = ringtone?.Id ?? _config.Ringtone,
                MicrophoneVolume = Math.Clamp(MicrophoneVolumeSlider.Value / 100, 0.25, 2.0),
                HeadphoneVolume = Math.Clamp(HeadphoneVolumeSlider.Value / 100, 0.25, 2.0),
                SipAlgCompatibilityMode = SipAlgCompatibilityCheckBox.IsChecked == true,
                SipSignallingTransport = ComboBoxTag(SipTransportModeComboBox, AppStartupConfig.TransportUdp),
                MobileNumber = MobileNumberTextBox.Text.Trim(),
                DndMode = ComboBoxText(DndModeComboBox, "Off"),
                DeclineIncomingAction = ComboBoxText(DeclineActionComboBox, "Send busy"),
                InternalBusyAction = ComboBoxText(InternalBusyActionComboBox, "Send busy"),
                InternalNoAnswerSeconds = ComboBoxSeconds(InternalNoAnswerTimeoutComboBox, 90),
                InternalNoAnswerAction = "Send busy",
                ExternalBusyAction = ComboBoxText(ExternalBusyActionComboBox, "Send busy"),
                ExternalNoAnswerSeconds = ComboBoxSeconds(ExternalNoAnswerTimeoutComboBox, 90),
                ExternalNoAnswerAction = "Send busy",
                QueuePickupEnabled = QueuePickupCheckBox.IsChecked == true,
                SingleClickBlindTransfer = SingleClickBlindTransferCheckBox.IsChecked == true,
                FlashCallState = FlashCallStateCheckBox.IsChecked == true,
                ShowCallStatistics = ShowCallStatisticsCheckBox.IsChecked == true,
                CombineContactsInSearch = CombineContactsCheckBox.IsChecked == true,
                FailedCallDisplaySeconds = ComboBoxSeconds(FailedCallTimeoutComboBox, 5),
                CallPickupPrefix = string.IsNullOrWhiteSpace(CallPickupPrefixTextBox.Text) ? "*4" : CallPickupPrefixTextBox.Text.Trim(),
                AutoAnswerEnabled = AutoAnswerCheckBox?.IsChecked == true,
                QueueLoginLogoutCode = string.IsNullOrWhiteSpace(QueueToggleCodeTextBox.Text) ? "*62" : QueueToggleCodeTextBox.Text.Trim(),
                CallRecordingCode = string.IsNullOrWhiteSpace(CallRecordingCodeTextBox.Text) ? "*1" : CallRecordingCodeTextBox.Text.Trim(),
                VoicemailNumber = string.IsNullOrWhiteSpace(VoicemailCodeTextBox.Text) ? "*2" : VoicemailCodeTextBox.Text.Trim(),
                IgnoreSslErrors = IgnoreSslErrorsCheckBox.IsChecked == true,
                DataHandlerUrl = dataHandlerUrl
            };

            await _cacheService.SaveSettingsAsync(_config.WithFixedSipEndpoint());
            ApplyDndMode();
            _sipRegistrationService.UpdateNetworkAssistance(_config.SipAlgCompatibilityMode);
            UpdateNetworkAssistanceText();
            _ = _chatService.UpdateServerUrlAsync(_config.DataHandlerUrl);

            var mediaDeviceChanged = previousInput.Id != _config.AudioInput.Id || previousOutput.Id != _config.AudioOutput.Id;
            var transportChanged = !string.Equals(previousTransport, _config.SipSignallingTransport, StringComparison.OrdinalIgnoreCase);
            var credentialsChanged = !string.Equals(previousExtension, _config.Extension) ||
                                     !string.Equals(previousUsername, _config.Username) ||
                                     !string.Equals(previousPassword, _config.Password) ||
                                     !string.Equals(previousServer, _config.Server);

            if (_testTonePlaying)
            {
                _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
                _testTonePlaying = false;
                TestToneButton.Content = "Preview Tone";
            }

            if (QueueLineContainer != null)
            {
                QueueLineContainer.Visibility = _config.QueuePickupEnabled ? Visibility.Visible : Visibility.Collapsed;
            }

            // Deselect list items to prevent any accidental key or mouse activation
            CallHistoryListView.SelectedItem = null;
            RecentCallsListView.SelectedItem = null;
            DialFavoritesListView.SelectedItem = null;
            PhonebookContactsListView.SelectedItem = null;

            SettingsOverlay.IsHitTestVisible = true;
            if (SettingsSavedBanner != null)
            {
                SettingsSavedBanner.Visibility = Visibility.Visible;
                _settingsSavedBannerTimer?.Stop();
                _settingsSavedBannerTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
                _settingsSavedBannerTimer.Tick += (_, _) =>
                {
                    SettingsSavedBanner.Visibility = Visibility.Collapsed;
                    _settingsSavedBannerTimer?.Stop();
                };
                _settingsSavedBannerTimer.Start();
            }
            FooterStatusText.Text = "Settings saved successfully.";

            if (transportChanged || credentialsChanged)
            {
                _registered = false;
                UpdateCallControls();
                await RegisterSipAsync();
            }
            else if (mediaDeviceChanged)
            {
                UpdateCallControls();
            }
        }
        finally
        {
            SaveAllSettingsButton.IsEnabled = true;
        }
    }

    private void QueuePickupButton_Click(object sender, RoutedEventArgs e)
    {
        if (QueuePickupCheckBox.IsChecked != true)
        {
            FooterStatusText.Text = "Enable queue pickup first.";
            return;
        }

        var pickupCode = string.IsNullOrWhiteSpace(CallPickupPrefixTextBox.Text)
            ? (string.IsNullOrWhiteSpace(_config.CallPickupPrefix) ? "*4" : _config.CallPickupPrefix)
            : CallPickupPrefixTextBox.Text.Trim();
        DestinationTextBox.Text = pickupCode;
        MainTabs.SelectedItem = PhoneTab;
        DialButton_Click(sender, e);
    }

    private void SetQueueRingingState(bool isRinging, string? caller = null)
    {
        _queueIsRinging = isRinging;
        _queueFlashTimer?.Stop();

        if (QueueLineContainer == null || FrontQueuePickupButton == null || QueueStatusText == null)
        {
            return;
        }

        var pickupCode = string.IsNullOrWhiteSpace(CallPickupPrefixTextBox?.Text)
            ? (string.IsNullOrWhiteSpace(_config.CallPickupPrefix) ? "*4" : _config.CallPickupPrefix)
            : CallPickupPrefixTextBox.Text.Trim();

        FrontQueuePickupButton.ToolTip = $"Pick up ringing queue call ({pickupCode})";

        if (isRinging)
        {
            QueueStatusText.Text = string.IsNullOrWhiteSpace(caller) ? "● Call Ringing" : $"● Ringing: {caller}";
            QueueStatusText.Foreground = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#15803D")!;
            if (QueueAccentBar != null)
            {
                QueueAccentBar.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#16A34A")!;
            }
            QueueLineContainer.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#86EFAC")!;

            _queueFlashTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            _queueFlashTimer.Tick += (_, _) =>
            {
                if (!_queueIsRinging)
                {
                    _queueFlashTimer?.Stop();
                    return;
                }
                _queueFlashToggle = !_queueFlashToggle;
                if (_queueFlashToggle)
                {
                    FrontQueuePickupButton.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#16A34A")!;
                    FrontQueuePickupButton.Foreground = System.Windows.Media.Brushes.White;
                    FrontQueuePickupButton.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#15803D")!;
                }
                else
                {
                    FrontQueuePickupButton.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#DCFCE7")!;
                    FrontQueuePickupButton.Foreground = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#15803D")!;
                    FrontQueuePickupButton.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#86EFAC")!;
                }
            };
            _queueFlashTimer.Start();

            FrontQueuePickupButton.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#16A34A")!;
            FrontQueuePickupButton.Foreground = System.Windows.Media.Brushes.White;
            FrontQueuePickupButton.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#15803D")!;
        }
        else
        {
            QueueStatusText.Text = "• Idle";
            QueueStatusText.Foreground = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#64748B")!;
            if (QueueAccentBar != null)
            {
                QueueAccentBar.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#94A3B8")!;
            }
            QueueLineContainer.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#E2E8F0")!;

            FrontQueuePickupButton.Background = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#F1F5F9")!;
            FrontQueuePickupButton.Foreground = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#64748B")!;
            FrontQueuePickupButton.BorderBrush = (System.Windows.Media.Brush)new System.Windows.Media.BrushConverter().ConvertFromString("#E2E8F0")!;
        }
    }

    private void FrontQueuePickupButton_Click(object sender, RoutedEventArgs e)
    {
        SetQueueRingingState(false);
        QueuePickupButton_Click(sender, e);
    }

    private void QueuePickupCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        if (QueueLineContainer != null)
        {
            QueueLineContainer.Visibility = QueuePickupCheckBox.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    private async void ClearHistoryButton_Click(object sender, RoutedEventArgs e)
    {
        if (_callHistory.Count == 0)
        {
            FooterStatusText.Text = "Call history is already empty.";
            return;
        }

        if (!ConfirmDialogWindow.Confirm(this, "Clear call history", "Clear all call history?", "Clear history"))
        {
            return;
        }

        _callHistory.Clear();
        await _callHistoryStore.SaveAsync(_callHistory);
        ApplyGlobalSearchFilter();
        FooterStatusText.Text = "Call history cleared.";
    }

    private async void CheckUpdatesButton_Click(object sender, RoutedEventArgs e)
    {
        CheckUpdatesButton.IsEnabled = false;
        UpdateStatusText.Text = "Checking for updates...";

        try
        {
            var result = await _updateService.CheckForUpdatesAsync();
            UpdateStatusText.Text = result.Message;
            UpdateNotesText.Text = result.Notes ?? string.Empty;
            FooterStatusText.Text = result.Message;

            if (result.UpdateAvailable && !string.IsNullOrWhiteSpace(result.DownloadUrl))
            {
                var notes = string.IsNullOrWhiteSpace(result.Notes) ? "" : $"\n\n{result.Notes}";
                var install = ConfirmDialogWindow.Confirm(
                    this,
                    "Update available",
                    $"{result.Message}{notes}\n\nDownload and install now?",
                    "Install update",
                    "Not now");

                if (install)
                {
                    try
                    {
                        var progress = new Progress<int>(percent =>
                        {
                            UpdateStatusText.Text = $"Downloading update... {percent}%";
                        });
                        var installerPath = await _updateService.DownloadInstallerAsync(result, progress);
                        UpdateStatusText.Text = "Starting installer...";
                        FooterStatusText.Text = "Starting update installer. Merlin SIP will close.";
                        StartInstallerAndRestart(installerPath);
                        System.Windows.Application.Current.Shutdown();
                    }
                    catch (Exception error)
                    {
                        DebugLog.Write($"UPDATE INSTALL failed error={error.Message}");
                        UpdateStatusText.Text = "Unable to download the update right now.";
                        FooterStatusText.Text = UpdateStatusText.Text;
                    }
                }
            }
        }
        catch (Exception error)
        {
            DebugLog.Write($"UPDATE CHECK UI failed error={error.Message}");
            UpdateStatusText.Text = "Unable to check for updates right now.";
            FooterStatusText.Text = UpdateStatusText.Text;
        }
        finally
        {
            CheckUpdatesButton.IsEnabled = true;
        }
    }

    private async Task CheckForUpdatesOnStartupAsync()
    {
        if (_startupUpdateCheckCompleted)
        {
            return;
        }

        _startupUpdateCheckCompleted = true;
        await Task.Delay(TimeSpan.FromSeconds(2));

        var result = await _updateService.CheckForUpdatesAsync();
        if (!result.UpdateAvailable || string.IsNullOrWhiteSpace(result.DownloadUrl))
        {
            return;
        }

        UpdateStatusText.Text = result.Message;
        UpdateNotesText.Text = result.Notes ?? string.Empty;
        FooterStatusText.Text = "A Merlin SIP update is available.";

        var notes = string.IsNullOrWhiteSpace(result.Notes) ? "" : $"\n\n{result.Notes}";
        var install = ConfirmDialogWindow.Confirm(
            this,
            "Merlin SIP update available",
            $"{result.Message}{notes}\n\nInstall this update now?",
            "Install update",
            "Not now");

        if (install)
        {
            try
            {
                var progress = new Progress<int>(percent => { FooterStatusText.Text = $"Downloading update... {percent}%"; });
                var installerPath = await _updateService.DownloadInstallerAsync(result, progress);
                StartInstallerAndRestart(installerPath);
                System.Windows.Application.Current.Shutdown();
            }
            catch (Exception error)
            {
                DebugLog.Write($"STARTUP UPDATE failed error={error.Message}");
                FooterStatusText.Text = "Unable to start the update right now.";
            }
        }
    }

    private void StartInstallerAndRestart(string installerPath)
    {
        _allowExit = true;
        WindowsStartupService.QueueLaunchAfterUpdate();

        var programFilesDir = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var canonicalExe = Path.Combine(programFilesDir, "CK Media Services", "Merlin SIP", "MerlinSIP.exe");
        var fallbackExe = Path.Combine(programFilesDir, "Merlin SIP", "MerlinSIP.exe");
        var currentExe = Environment.ProcessPath ?? "";
        var targetExe = File.Exists(canonicalExe) ? canonicalExe : (File.Exists(fallbackExe) ? fallbackExe : (File.Exists(currentExe) ? currentExe : canonicalExe));

        var currentPid = Environment.ProcessId;
        var updateDir = Path.Combine(Path.GetTempPath(), "MerlinSIP");
        Directory.CreateDirectory(updateDir);
        var tempScript = Path.Combine(updateDir, "apply-update.cmd");

        var scriptContent = $@"@echo off
timeout /t 1 /nobreak >nul
taskkill /pid {currentPid} /f >nul 2>&1
taskkill /f /im MerlinSIP.exe >nul 2>&1
timeout /t 1 /nobreak >nul
start /wait """" msiexec.exe /i ""{installerPath}"" /passive /norestart
timeout /t 1 /nobreak >nul
if exist ""{canonicalExe}"" (
    start """" ""{canonicalExe}""
) else if exist ""{fallbackExe}"" (
    start """" ""{fallbackExe}""
) else if exist ""{targetExe}"" (
    start """" ""{targetExe}""
)
del ""%~f0""
";

        File.WriteAllText(tempScript, scriptContent, System.Text.Encoding.ASCII);

        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"\"{tempScript}\"\"")
        {
            CreateNoWindow = true,
            UseShellExecute = true
        });

        try
        {
            System.Windows.Application.Current?.Shutdown();
        }
        catch { }

        Environment.Exit(0);
    }

    private void UpdateCallControls()
    {
        var hasDestination = !string.IsNullOrWhiteSpace(DestinationTextBox.Text);
        DialButton.IsEnabled = !_licenseLocked && _registered && hasDestination && !_callInProgress && !_incomingRinging;
        HangupButton.IsEnabled = !_licenseLocked && (_callInProgress || _incomingRinging);
        MuteButton.IsEnabled = !_licenseLocked && _callConnected && _sipRegistrationService.CanControlAudio;
        HoldButton.IsEnabled = !_licenseLocked && _callConnected && _sipRegistrationService.CanControlAudio;
        ConferenceButton.IsEnabled = !_licenseLocked && _callConnected && _sipRegistrationService.CanControlAudio;
        TransferButton.IsEnabled = !_licenseLocked && _callConnected;
        RecordButton.IsEnabled = !_licenseLocked && _callConnected;

        VoicemailButton.IsEnabled = !_licenseLocked && _registered && !_callInProgress && !_incomingRinging;

        var activeCall = _callInProgress || _incomingRinging || _callConnected;

        DialButton.Visibility = Visibility.Visible;
        HangupButton.Visibility = Visibility.Collapsed;

        // In-call options are all on the Line cards; dialer actions stay accessible at the bottom
        InCallButtonsGrid.Visibility = Visibility.Collapsed;
        DialerQuickActionsGrid.Visibility = Visibility.Visible;

        if (activeCall)
        {
            DestinationPreviewText.FontSize = 36;
            CallerLookupText.FontSize = 15;
        }
        else
        {
            DestinationPreviewText.FontSize = 28;
            CallerLookupText.FontSize = 13;
        }
    }

    private void SendErrorLogButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var logText = File.Exists(DebugLog.Path)
                ? File.ReadAllText(DebugLog.Path)
                : "No error log has been created yet.";

            const int maxBodyLength = 12000;
            if (logText.Length > maxBodyLength)
            {
                logText = logText[^maxBodyLength..];
            }

            var subject = Uri.EscapeDataString("Merlin SIP error log");
            var body = Uri.EscapeDataString($"Please investigate this Merlin SIP error log.\r\n\r\n{logText}");
            Process.Start(new ProcessStartInfo($"mailto:sip-log@chriskendall.media?subject={subject}&body={body}")
            {
                UseShellExecute = true
            });

            FooterStatusText.Text = "Error log email opened.";
        }
        catch (Exception error)
        {
            FooterStatusText.Text = $"Unable to open error log email: {error.Message}";
        }
    }

    private async void ResetCacheButton_Click(object sender, RoutedEventArgs e)
    {
        if (!ConfirmDialogWindow.Confirm(
            this,
            "Reset application",
            "Clear saved account settings, contacts, and call history? Merlin SIP will close so setup can run again next time.",
            "Reset application"))
        {
            return;
        }

        _cacheService.Reset();
        _contacts.Clear();
        _callHistory.Clear();
        _chatMessages.Clear();
        await Task.Delay(50);
        System.Windows.Application.Current.Shutdown();
    }



    private async Task OnCallFinished(string resultState, string message)
    {
        if (Interlocked.Exchange(ref _callFinishing, 1) == 1)
        {
            return;
        }

        try
        {
            HideIncomingCallSurfaces();
        FlashWindow(false);
            StopLocalRingback();
            _ringtonePlayer.Stop();
        _secondaryRingtonePlayer.Stop();
            
            var otherLineHasCall = _selectedLine == 1 ? _line2.HasCall : _line1.HasCall;
            _incomingRinging = false;
            _lastCallFinishedAt = DateTimeOffset.Now;
            _muted = false;
            _held = false;
            _sipRegistrationService.SetMuted(false);
            if (!otherLineHasCall)
            {
                _sipRegistrationService.SetHeldLocal(false);
            }
            UpdateInCallButtonIcons();
            if (_selectedLine == 1)
            {
                _line1.Status = "Idle";
                _line1.RemoteNumber = "";
                _line1.RemoteName = "";
                _line1.ConnectedAt = null;
                _line1.IsHeld = false;
                if (_line2.HasCall)
                {
                    _selectedLine = 2;
                }
            }
            else
            {
                _line2.Status = "Idle";
                _line2.RemoteNumber = "";
                _line2.RemoteName = "";
                _line2.ConnectedAt = null;
                _line2.IsHeld = false;
                if (_line1.HasCall)
                {
                    _selectedLine = 1;
                }
            }
            UpdateLineAppearances();
            if (!otherLineHasCall)
            {
                _callInProgress = false;
                _callConnected = false;
                CloseVideoCallWindow();
                StopCallTimer();
                ClearDialpadAfterCall();
            }
            else
            {
                var remaining = _selectedLine == 1 ? _line1 : _line2;
                _callInProgress = true;
                _callConnected = remaining.Status == "Connected";
                if (_callConnected)
                {
                    _activeCallConnectedAt = remaining.ConnectedAt ?? DateTimeOffset.Now;
                    if (!_callTimer.IsEnabled)
                    {
                        _callTimer.Start();
                    }
                }
            }

            var number = _activeRemoteNumber;
            var direction = _activeCallDirection;
            var startAt = _activeCallStartedAt;

            _activeCallStartedAt = null;
            _activeRemoteNumber = "";
            
            if (!string.IsNullOrWhiteSpace(number))
            {
                // Let BLF system handle contact presence updates naturally
                var contact = _contactStore.FindByNumber(_contacts, number);
                var name = contact?.Name ?? number;
                await AddCallHistory(direction, name, number, resultState, message, startAt);
            }

            // Restore user's selected presence after call ends
            SetPresenceDisplay(_userSelectedPresence);
            UpdateCallControls();
        }
        finally
        {
            _callFinishing = 0;
        }
    }

    private async Task AddCallHistory(string direction, string name, string number, string result, string detail, DateTimeOffset? startedAt = null)
    {
        var start = startedAt ?? DateTimeOffset.Now;
        var end = DateTimeOffset.Now;
        var duration = end > start ? (end - start).ToString(@"mm\:ss") : "";

        var measured = _sipRegistrationService.HasMeasuredCallQuality;
        var (loss, jitter, latency, signalBars, _) = _sipRegistrationService.GetCallQualityStats();
        var mos = measured && latency > 0 ? VoipTools.CalculateMosScore(latency, jitter, loss) : 0;
        var level = mos <= 0 ? "" : mos >= 4.2 ? "Excellent" : mos >= 3.8 ? "Good" : mos >= 3.0 ? "Fair" : "Poor";
        var rFactor = mos > 0 ? Math.Clamp(93.2 - (loss * 2.5) - (jitter * 0.1) - (latency * 0.03), 0, 100) : 0;

        var entry = new CallHistoryEntry
        {
            Direction = direction,
            Name = name,
            Number = number,
            StartedAt = start.ToString("yyyy-MM-dd HH:mm:ss"),
            EndedAt = end.ToString("yyyy-MM-dd HH:mm:ss"),
            Duration = duration,
            Result = result,
            Detail = detail,
            MosScore = mos > 0 ? Math.Round(mos, 1) : 0,
            QualityLevel = level,
            PacketLossPercent = measured ? Math.Round(loss, 2) : 0,
            JitterMs = measured ? Math.Round(jitter, 1) : 0,
            LatencyMs = measured && latency > 0 ? Math.Round(latency, 1) : 0,
            SignalBars = measured ? signalBars : 0,
            RFactor = mos > 0 ? Math.Round(rFactor, 1) : 0,
            Codec = measured ? _sipRegistrationService.NegotiatedAudioCodec : "",
            QualityMeasured = mos > 0
        };

        _callHistory.Insert(0, entry);
        await _callHistoryStore.SaveAsync(_callHistory);
        ApplyGlobalSearchFilter();
    }

    private void QualityAnalysisButton_Click(object sender, RoutedEventArgs e)
    {
        CallQualityDetailsWindow.ShowOverallAnalysis(this, _callHistory);
    }

    private void InspectCallQualityButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: CallHistoryEntry entry })
        {
            CallQualityDetailsWindow.ShowCallQuality(this, entry);
        }
    }

    private async void SendMessageButton_Click(object sender, RoutedEventArgs e)
    {
        await SendCurrentMessageAsync();
    }

    private async void AttachFileButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_selectedChatNumber))
        {
            NoticeText.Text = "Select a conversation before attaching files.";
            NoticeText.Visibility = Visibility.Visible;
            return;
        }

        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Select File or Image to Send",
            Filter = "All Files (*.*)|*.*|Images (*.png;*.jpg;*.jpeg;*.gif)|*.png;*.jpg;*.jpeg;*.gif|Documents (*.pdf;*.docx;*.txt)|*.pdf;*.docx;*.txt"
        };

        if (dialog.ShowDialog(this) == true)
        {
            await SendFileAsync(dialog.FileName);
        }
    }

    private async Task SendFileAsync(string filePath)
    {
        if (string.IsNullOrWhiteSpace(_selectedChatNumber) || !File.Exists(filePath)) return;

        var fileName = Path.GetFileName(filePath);
        NoticeText.Text = $"Uploading {fileName}...";
        NoticeText.Visibility = Visibility.Visible;

        var contact = _contactStore.FindByNumber(_contacts, _selectedChatNumber);
        var name = contact?.Name ?? _selectedChatNumber;

        await EnsureChatConnectedAsync();
        await _chatService.JoinConversationAsync(_selectedChatNumber);
        var upload = await _chatService.UploadAndSendFileAsync(filePath, _selectedChatNumber, _config.Extension);
        if (!upload.Uploaded)
        {
            NoticeText.Text = upload.Detail;
            FooterStatusText.Text = upload.Detail;
            return;
        }

        var fileInfo = new FileInfo(filePath);
        var fileMessage = string.IsNullOrWhiteSpace(upload.Url) ? fileName : upload.Url;
        var sent = await _chatService.SendMessageAsync(_selectedChatNumber, _config.Extension, fileMessage, "file", fileName, fileInfo.Length);
        if (sent.Accepted)
        {
            await AddChatMessage("Outbound", name, _selectedChatNumber, $"Sent file: {fileName}", sent.Delivered ? "Delivered" : "Sent");
            NoticeText.Text = $"File {fileName} sent.";
            FooterStatusText.Text = $"File sent: {fileName}";
        }
        else
        {
            await AddChatMessage("Outbound", name, _selectedChatNumber, $"Uploaded file: {fileName}", "Uploaded");
            NoticeText.Text = $"File uploaded, but could not be sent. {sent.Detail}";
            FooterStatusText.Text = sent.Detail;
        }
    }

    private void Chat_PreviewDragOver(object sender, System.Windows.DragEventArgs e)
    {
        if (e.Data.GetDataPresent(System.Windows.DataFormats.FileDrop))
        {
            e.Effects = System.Windows.DragDropEffects.Copy;
            e.Handled = true;
        }
    }

    private async void Chat_Drop(object sender, System.Windows.DragEventArgs e)
    {
        if (e.Data.GetDataPresent(System.Windows.DataFormats.FileDrop))
        {
            var files = (string[])e.Data.GetData(System.Windows.DataFormats.FileDrop);
            if (files != null && files.Length > 0)
            {
                e.Handled = true;
                foreach (var file in files)
                {
                    await SendFileAsync(file);
                }
            }
        }
    }

    private async Task SendCurrentMessageAsync()
    {
        var destination = NormalizeDialDestination(MessageToTextBox.Text);
        var message = MessageBodyTextBox.Text.Trim();

        if (string.IsNullOrWhiteSpace(destination))
        {
            ShowChatNotice("Enter an extension to message.");
            return;
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            ShowChatNotice("Enter a message first.");
            return;
        }

        // Instant clear and retain focus for fast messaging
        MessageBodyTextBox.Text = string.Empty;
        MessageBodyTextBox.Focus();

        var contact = _contactStore.FindByNumber(_contacts, destination);
        var name = contact?.Name ?? destination;
        if (!string.Equals(_selectedChatNumber, destination, StringComparison.OrdinalIgnoreCase))
        {
            _selectedChatNumber = destination;
            ChatThreadTitleText.Text = name;
            ChatThreadSubtitleText.Text = contact is null || string.IsNullOrWhiteSpace(contact.Company)
                ? destination
                : $"{destination}  {contact.Company}";
        }

        var entry = await AddChatMessage("Outbound", name, destination, message, "Sent");

        try
        {
            await EnsureChatConnectedAsync();
            if (!_chatService.IsConnected)
            {
                var idx = _chatMessages.IndexOf(entry);
                if (idx >= 0)
                {
                    _chatMessages[idx] = entry with { Result = "Offline" };
                    RefreshChatThread();
                }
                ShowChatNotice("Chat server is offline.");
                return;
            }

            await _chatService.JoinConversationAsync(destination);
            var sent = await _chatService.SendMessageAsync(destination, _config.Extension, message);
            if (!sent.Accepted)
            {
                var idx = _chatMessages.IndexOf(entry);
                if (idx >= 0)
                {
                    _chatMessages[idx] = entry with { Result = "Failed" };
                    RefreshChatThread();
                }
                ShowChatNotice(sent.Detail);
                return;
            }

            if (sent.Delivered)
            {
                var idx = _chatMessages.IndexOf(entry);
                if (idx >= 0)
                {
                    _chatMessages[idx] = entry with { Result = "Delivered" };
                    RefreshChatThread();
                }
            }

            ShowChatNotice(sent.Detail);
        }
        catch (Exception ex)
        {
            var idx = _chatMessages.IndexOf(entry);
            if (idx >= 0)
            {
                _chatMessages[idx] = entry with { Result = "Failed" };
                RefreshChatThread();
            }
            ShowChatNotice($"Send error: {ex.Message}");
        }
    }

    private void MessageBodyTextBox_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key != Key.Enter && e.Key != Key.Return)
        {
            return;
        }

        // Shift+Enter or Ctrl+Enter moves down a line
        if ((Keyboard.Modifiers & ModifierKeys.Shift) == ModifierKeys.Shift ||
            (Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
        {
            var box = MessageBodyTextBox;
            var index = box.SelectionStart;
            box.SelectedText = Environment.NewLine;
            box.SelectionStart = index + Environment.NewLine.Length;
            box.SelectionLength = 0;
            e.Handled = true;
            return;
        }

        // Plain Return/Enter sends automatically
        e.Handled = true;
        if (!e.IsRepeat)
        {
            _ = SendCurrentMessageAsync();
        }
    }

    private void ShowChatNotice(string message)
    {
        FooterStatusText.Text = message;
        NoticeText.Text = message;
        NoticeText.Visibility = Visibility.Visible;
    }

    private void ChatContactsFilterTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (ChatContactsFilterPlaceholder != null)
        {
            ChatContactsFilterPlaceholder.Visibility = string.IsNullOrWhiteSpace(ChatContactsFilterTextBox.Text)
                ? Visibility.Visible
                : Visibility.Collapsed;
        }
        FilterChatContacts();
    }

    private void FilterChatContacts()
    {
        var filter = ChatContactsFilterTextBox?.Text?.Trim() ?? "";
        var matching = string.IsNullOrWhiteSpace(filter)
            ? _contacts.ToList()
            : _contacts.Where(c =>
                (!string.IsNullOrWhiteSpace(c.Name) && c.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)) ||
                (!string.IsNullOrWhiteSpace(c.Number) && c.Number.Contains(filter, StringComparison.OrdinalIgnoreCase)) ||
                (!string.IsNullOrWhiteSpace(c.Company) && c.Company.Contains(filter, StringComparison.OrdinalIgnoreCase))).ToList();

        ReplaceCollection(_filteredChatContacts, matching);
    }

    private void UpdateChatServerStatus(bool connected)
    {
        if (ChatServerStatusDot == null || ChatServerStatusText == null || ChatServerStatusBadge == null) return;
        if (connected)
        {
            ChatServerStatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#10B981")!;
            ChatServerStatusText.Text = "Chat Online";
            ChatServerStatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#059669")!;
            ChatServerStatusBadge.Background = (WpfBrush)new BrushConverter().ConvertFromString("#ECFDF5")!;
        }
        else
        {
            ChatServerStatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
            ChatServerStatusText.Text = "Chat Offline";
            ChatServerStatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#64748B")!;
            ChatServerStatusBadge.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F1F5F9")!;
        }
    }

    private void ChatContactsListView_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        var item = GetClickedListBoxItem(ChatContactsListView, e);
        if (item?.DataContext is ContactEntry contact)
        {
            SelectChatContact(contact);
        }
    }

    private void ChatContactsListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ChatContactsListView.SelectedItem is ContactEntry contact)
        {
            SelectChatContact(contact);
        }
    }

    private void SelectChatContact(ContactEntry contact)
    {
        _selectedChatNumber = NormalizeDialDestination(contact.Number);
        MessageToTextBox.Text = contact.Number;
        ChatThreadTitleText.Text = contact.Name;
        ChatThreadSubtitleText.Text = string.IsNullOrWhiteSpace(contact.Company)
            ? contact.Number
            : $"{contact.Number}  {contact.Company}";
        RefreshChatThread();
        _ = EnsureChatConnectedAsync();
        MessageBodyTextBox.Focus();
    }

    private async Task EnsureChatConnectedAsync()
    {
        if (!_chatService.IsConnected)
        {
            await _chatService.ConnectAsync();
        }

        await JoinChatRoomsAsync();
    }

    private async Task JoinChatRoomsAsync()
    {
        if (!string.IsNullOrWhiteSpace(_config.Extension))
        {
            await _chatService.JoinConversationAsync(_config.Extension);
        }

        if (!string.IsNullOrWhiteSpace(_selectedChatNumber))
        {
            await _chatService.JoinConversationAsync(_selectedChatNumber);
        }
    }

    private void RefreshChatThread()
    {
        _chatThreadMessages.Clear();
        bool hasSelection = !string.IsNullOrWhiteSpace(_selectedChatNumber);
        if (ChatCallButton != null) ChatCallButton.IsEnabled = hasSelection;
        if (ChatVideoCallButton != null) ChatVideoCallButton.IsEnabled = hasSelection;
        if (ClearChatThreadButton != null) ClearChatThreadButton.IsEnabled = hasSelection;

        if (!hasSelection)
        {
            ChatThreadTitleText.Text = "Choose a conversation";
            ChatThreadSubtitleText.Text = "";
            return;
        }

        foreach (var message in _chatMessages
            .Where(message => MessageBelongsToThread(message, _selectedChatNumber))
            .OrderBy(message => ParseChatTimestamp(message.SentAt)))
        {
            _chatThreadMessages.Add(message);
        }

        if (_chatThreadMessages.Count > 0)
        {
            Dispatcher.InvokeAsync(() =>
            {
                try { ChatMessagesListView.ScrollIntoView(_chatThreadMessages[^1]); } catch { }
            }, System.Windows.Threading.DispatcherPriority.Background);
        }
    }

    private async void ClearChatThreadButton_Click(object sender, RoutedEventArgs e)
    {
        var destination = NormalizeDialDestination(MessageToTextBox.Text);
        if (string.IsNullOrWhiteSpace(destination))
        {
            FooterStatusText.Text = "Choose a conversation first.";
            return;
        }

        var contact = _contactStore.FindByNumber(_contacts, destination);
        var displayName = contact?.Name ?? destination;
        if (!ConfirmDialogWindow.Confirm(
            this,
            "Clear conversation",
            $"Clear message history with {displayName}?",
            "Clear chat"))
        {
            return;
        }

        var threadMessages = _chatMessages
            .Where(message => MessageBelongsToThread(message, destination))
            .ToList();

        foreach (var message in threadMessages)
        {
            _chatMessages.Remove(message);
        }

        await _chatMessageStore.SaveAsync(_chatMessages);
        RefreshChatThread();
        FooterStatusText.Text = $"Conversation with {displayName} cleared.";
    }

    private async void ChatCallButton_Click(object sender, RoutedEventArgs e)
    {
        var destination = NormalizeDialDestination(_selectedChatNumber);
        if (string.IsNullOrWhiteSpace(destination))
        {
            destination = NormalizeDialDestination(MessageToTextBox.Text);
        }

        if (string.IsNullOrWhiteSpace(destination))
        {
            ShowChatNotice("Choose a conversation to call.");
            return;
        }

        var contact = _contactStore.FindByNumber(_contacts, destination);
        if (contact != null)
        {
            CallContact(contact);
        }
        else
        {
            DestinationTextBox.Text = destination;
            MainTabs.SelectedItem = PhoneTab;
            await StartOutboundCallAsync(destination, isVideo: false);
        }
    }

    private async void ChatVideoCallButton_Click(object sender, RoutedEventArgs e)
    {
        var destination = NormalizeDialDestination(_selectedChatNumber);
        if (string.IsNullOrWhiteSpace(destination))
        {
            destination = NormalizeDialDestination(MessageToTextBox.Text);
        }

        if (string.IsNullOrWhiteSpace(destination))
        {
            ShowChatNotice("Choose a conversation for video call.");
            return;
        }

        var contact = _contactStore.FindByNumber(_contacts, destination);
        if (contact != null)
        {
            VideoCallContact(contact);
        }
        else
        {
            DestinationTextBox.Text = destination;
            MainTabs.SelectedItem = PhoneTab;
            await StartOutboundCallAsync(destination, isVideo: true);
        }
    }

    private async Task HandleIncomingChatMessageAsync(ChatMessagePayload? payload)
    {
        if (payload is null)
        {
            return;
        }

        try
        {
            var senderId = payload.SenderId?.Trim() ?? "";
            var conversationId = payload.ConversationId?.Trim() ?? "";
            var self = NormalizeDialDestination(_config.Extension);
            var normalizedSender = NormalizeDialDestination(senderId);
            var normalizedConversation = NormalizeDialDestination(conversationId);
            if (!string.IsNullOrWhiteSpace(normalizedSender) &&
                normalizedSender.Equals(self, StringComparison.OrdinalIgnoreCase))
            {
                MarkOwnMessageDelivered(payload.Content, normalizedConversation);
                return;
            }

            var content = payload.Content?.Trim() ?? "";
            var fileName = payload.FileName?.Trim() ?? "";
            var fileUrl = payload.FileUrl?.Trim() ?? "";
            var attachment = !string.IsNullOrWhiteSpace(fileName) ? fileName : fileUrl;
            var displayMessage = string.IsNullOrWhiteSpace(attachment)
                ? content
                : string.IsNullOrWhiteSpace(content) || string.Equals(content, attachment, StringComparison.Ordinal)
                    ? $"[File: {attachment}]"
                    : $"{content} [File: {attachment}]";

            if (string.IsNullOrWhiteSpace(displayMessage))
            {
                return;
            }

            var threadNumber = !string.IsNullOrWhiteSpace(normalizedSender) &&
                               !normalizedSender.Equals(self, StringComparison.OrdinalIgnoreCase)
                ? normalizedSender
                : normalizedConversation;
            if (!string.IsNullOrWhiteSpace(_selectedChatNumber) &&
                (_selectedChatNumber.Equals(normalizedConversation, StringComparison.OrdinalIgnoreCase) ||
                 _selectedChatNumber.Equals(normalizedSender, StringComparison.OrdinalIgnoreCase)))
            {
                threadNumber = _selectedChatNumber;
            }

            var contact = _contactStore.FindByNumber(_contacts, threadNumber)
                ?? _contactStore.FindByNumber(_contacts, conversationId);
            var senderName = contact?.Name ?? (string.IsNullOrWhiteSpace(senderId) ? threadNumber : senderId);

            await AddChatMessage("Inbound", senderName, threadNumber, displayMessage, "Received");
            FooterStatusText.Text = $"Chat message received from {senderName}.";
            RefreshChatThread();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Chat message handle error: {ex.Message}");
        }
    }

    private void MarkOwnMessageDelivered(string? content, string conversationId)
    {
        var text = content?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        for (var index = _chatMessages.Count - 1; index >= 0; index--)
        {
            var message = _chatMessages[index];
            if (!string.Equals(message.Direction, "Outbound", StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(message.Message?.Trim(), text, StringComparison.Ordinal) ||
                !NormalizeDialDestination(message.Number).Equals(conversationId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.Equals(message.Result, "Delivered", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            _chatMessages[index] = message with { Result = "Delivered" };
            RefreshChatThread();
            return;
        }
    }

    private static bool MessageBelongsToThread(ChatMessageEntry message, string destination)
    {
        return NormalizeDialDestination(message.Number).Equals(destination, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<ChatMessageEntry> AddChatMessage(string direction, string name, string number, string message, string result)
    {
        var entry = new ChatMessageEntry
        {
            Direction = direction,
            Name = name,
            Number = number,
            Message = message,
            SentAt = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            Result = result
        };

        _chatMessages.Add(entry);
        await _chatMessageStore.SaveAsync(_chatMessages.OrderBy(message => ParseChatTimestamp(message.SentAt)));
        if (MessageBelongsToThread(entry, _selectedChatNumber))
        {
            RefreshChatThread();
        }
        return entry;
    }

    private static DateTimeOffset ParseChatTimestamp(string value)
    {
        return DateTimeOffset.TryParse(value, out var parsed)
            ? parsed
            : DateTimeOffset.MinValue;
    }

    private void ContactTextBox_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            SaveContactButton_Click(this, new RoutedEventArgs());
            e.Handled = true;
        }
    }

    private void LiveCallStatisticsCard_MouseDown(object sender, MouseButtonEventArgs e)
    {
        var measured = _sipRegistrationService.HasMeasuredCallQuality;
        var (loss, jitter, latency, signalBars, _) = _sipRegistrationService.GetCallQualityStats();
        var mos = measured && latency > 0 ? VoipTools.CalculateMosScore(latency, jitter, loss) : 0;
        var level = mos <= 0 ? "" : mos >= 4.2 ? "Excellent" : mos >= 3.8 ? "Good" : mos >= 3.0 ? "Fair" : "Poor";

        var liveEntry = new CallHistoryEntry
        {
            Direction = _activeCallDirection ?? "Active",
            Name = string.IsNullOrWhiteSpace(CallerLookupText.Text) ? "Active Call" : CallerLookupText.Text,
            Number = DestinationTextBox.Text,
            Duration = CallTimerText.Text.Replace("Active ", ""),
            Result = "In Progress",
            Detail = measured ? "Measured from received audio." : "No audio has been measured for this call.",
            MosScore = mos > 0 ? Math.Round(mos, 1) : 0,
            QualityLevel = level,
            PacketLossPercent = measured ? Math.Round(loss, 2) : 0,
            JitterMs = measured ? Math.Round(jitter, 1) : 0,
            LatencyMs = measured && latency > 0 ? Math.Round(latency, 1) : 0,
            SignalBars = measured ? signalBars : 0,
            RFactor = mos > 0 ? Math.Round(Math.Clamp(93.2 - (loss * 2.5) - (jitter * 0.1) - (latency * 0.03), 0, 100), 1) : 0,
            Codec = measured ? _sipRegistrationService.NegotiatedAudioCodec : "",
            QualityMeasured = mos > 0
        };

        CallQualityDetailsWindow.ShowCallQuality(this, liveEntry);
    }

    private void Line2AmberFlashTimer_Tick(object? sender, EventArgs e)
    {
        if (_line2.Status != "Incoming")
        {
            _line2AmberFlashTimer.Stop();
            return;
        }
        _line2AmberFlashState = !_line2AmberFlashState;
        if (_line2AmberFlashState)
        {
            Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FEF3C7")!;
            Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#F59E0B")!;
            Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#D97706")!;
        }
        else
        {
            Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FFFFFF")!;
            Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#FCD34D")!;
            Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#B45309")!;
        }
    }

    private void StartLine2AmberFlash()
    {
        if (!_line2AmberFlashTimer.IsEnabled)
        {
            _line2AmberFlashState = false;
            _line2AmberFlashTimer.Start();
        }
    }

    private void StopLine2AmberFlash()
    {
        if (_line2AmberFlashTimer.IsEnabled)
        {
            _line2AmberFlashTimer.Stop();
        }
    }

    private void UpdateLineAppearances()
    {
        // --- LINE 1 ---
        if (_line1.Status == "Connected")
        {
            Line1Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F0FDF4")!;
            Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#86EFAC")!;
            Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#16A34A")!;

            Line1Card.Padding = new Thickness(14, 10, 14, 10);
            Line1InfoPanel.Visibility = Visibility.Visible;
            Line1ActionRow.Visibility = Visibility.Visible;
            Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString(_line1.IsHeld ? "#F59E0B" : "#10B981")!;
            var elapsed = _line1.ConnectedAt.HasValue ? DateTimeOffset.Now - _line1.ConnectedAt.Value : TimeSpan.Zero;
            var time = elapsed.TotalHours >= 1 ? elapsed.ToString(@"hh\:mm\:ss") : elapsed.ToString(@"mm\:ss");
            Line1StatusText.Text = _line1.IsHeld ? "On Hold" : $"Connected ({time})";
            Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString(_line1.IsHeld ? "#D97706" : "#059669")!;
            Line1DetailText.Text = string.IsNullOrWhiteSpace(_line1.RemoteName) ? _line1.RemoteNumber : $"{_line1.RemoteName} ({_line1.RemoteNumber})";

            SetLineIconButton(Line1HoldResumeButton, _line1.IsHeld ? ResumeIcon : HoldIcon, _line1.IsHeld ? "Resume Call" : "Hold Call");
            SetLineIconButton(Line1MuteButton, _muted ? MutedMicIcon : MicIcon, _muted ? "Unmute Microphone" : "Mute Microphone", _muted ? "#EF4444" : "#1E293B");
            SetLineIconButton(Line1RecordButton, _sipRegistrationService.IsRecording ? "\uE73B" : RecordIcon, _sipRegistrationService.IsRecording ? "Stop Recording" : "Record Call", _sipRegistrationService.IsRecording ? "#EF4444" : "#1E293B");
            SetLineIconButton(Line1TransferButton, TransferIcon, "Transfer Call");
            SetLineIconButton(Line1ConferenceButton, ConferenceIcon, "Conference Calls");
            SetLineIconButton(Line1HangupButton, HangupIcon, "End Call");
        }
        else if (_line1.Status == "Calling")
        {
            Line1Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F0FDF4")!;
            Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#93C5FD")!;
            Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#2563EB")!;

            Line1Card.Padding = new Thickness(14, 10, 14, 10);
            Line1InfoPanel.Visibility = Visibility.Visible;
            Line1ActionRow.Visibility = Visibility.Visible;
            Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#3B82F6")!;
            Line1StatusText.Text = "Calling...";
            Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#2563EB")!;
            Line1DetailText.Text = string.IsNullOrWhiteSpace(_line1.RemoteName) ? _line1.RemoteNumber : $"{_line1.RemoteName} ({_line1.RemoteNumber})";
            SetLineIconButton(Line1HoldResumeButton, HoldIcon, "Hold Call");
            SetLineIconButton(Line1MuteButton, MicIcon, "Mute Microphone", "#1E293B");
            SetLineIconButton(Line1RecordButton, RecordIcon, "Record Call", "#1E293B");
            SetLineIconButton(Line1TransferButton, TransferIcon, "Transfer Call");
            SetLineIconButton(Line1ConferenceButton, ConferenceIcon, "Conference Calls");
            SetLineIconButton(Line1HangupButton, HangupIcon, "End Call");
        }
        else if (_line1.Status == "Incoming")
        {
            Line1Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FEF3C7")!;
            Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#F59E0B")!;
            Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#D97706")!;

            Line1Card.Padding = new Thickness(14, 10, 14, 10);
            Line1InfoPanel.Visibility = Visibility.Visible;
            Line1ActionRow.Visibility = Visibility.Visible;
            Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#EF4444")!;
            Line1StatusText.Text = "Incoming Call";
            Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#DC2626")!;
            Line1DetailText.Text = string.IsNullOrWhiteSpace(_line1.RemoteName) ? _line1.RemoteNumber : $"{_line1.RemoteName} ({_line1.RemoteNumber})";
        }
        else if (_line1.Status == "Failed")
        {
            Line1Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FEF2F2")!;
            Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#FECACA")!;
            Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#DC2626")!;

            Line1Card.Padding = new Thickness(14, 10, 14, 10);
            Line1InfoPanel.Visibility = Visibility.Visible;
            Line1ActionRow.Visibility = Visibility.Collapsed;
            Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#EF4444")!;
            Line1StatusText.Text = "Call Failed";
            Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#DC2626")!;
            Line1DetailText.Text = _line1.RemoteNumber;
        }
        else // Idle
        {
            Line1Card.Padding = new Thickness(14, 10, 14, 10);
            Line1InfoPanel.Visibility = Visibility.Visible;
            Line1ActionRow.Visibility = Visibility.Collapsed;
            Line1DetailText.Text = "";

            if (_selectedLine == 1)
            {
                Line1Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F8FAFC")!;
                Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#CBD5E1")!;
                Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#475569")!;
                Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
                Line1StatusText.Text = "Line 1  •  Ready";
                Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#475569")!;
            }
            else
            {
                Line1Card.Background = WpfBrushes.White;
                Line1Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#E2E8F0")!;
                Line1BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
                Line1StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#CBD5E1")!;
                Line1StatusText.Text = "Line 1  •  Idle";
                Line1StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
            }
        }

        // --- LINE 2 ---
        if (_line2.Status == "Incoming")
        {
            StartLine2AmberFlash();
            Line2Card.Padding = new Thickness(14, 10, 14, 10);
            Line2InfoPanel.Visibility = Visibility.Visible;
            Line2ActionRow.Visibility = Visibility.Collapsed;
            Line2IncomingActionRow.Visibility = Visibility.Visible;
            Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#F59E0B")!;
            Line2StatusText.Text = "Incoming Call";
            Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#D97706")!;
            Line2DetailText.Text = string.IsNullOrWhiteSpace(_line2.RemoteName) ? _line2.RemoteNumber : $"{_line2.RemoteName} ({_line2.RemoteNumber})";
        }
        else
        {
            StopLine2AmberFlash();

            if (_line2.Status == "Connected")
            {
                Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F0FDF4")!;
                Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#86EFAC")!;
                Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#16A34A")!;

                Line2Card.Padding = new Thickness(14, 10, 14, 10);
                Line2InfoPanel.Visibility = Visibility.Visible;
                Line2ActionRow.Visibility = Visibility.Visible;
                Line2IncomingActionRow.Visibility = Visibility.Collapsed;
                Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString(_line2.IsHeld ? "#F59E0B" : "#10B981")!;
                var elapsed = _line2.ConnectedAt.HasValue ? DateTimeOffset.Now - _line2.ConnectedAt.Value : TimeSpan.Zero;
                var time = elapsed.TotalHours >= 1 ? elapsed.ToString(@"hh\:mm\:ss") : elapsed.ToString(@"mm\:ss");
                Line2StatusText.Text = _line2.IsHeld ? "On Hold" : $"Connected ({time})";
                Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString(_line2.IsHeld ? "#D97706" : "#059669")!;
                Line2DetailText.Text = string.IsNullOrWhiteSpace(_line2.RemoteName) ? _line2.RemoteNumber : $"{_line2.RemoteName} ({_line2.RemoteNumber})";

                SetLineIconButton(Line2HoldResumeButton, _line2.IsHeld ? ResumeIcon : HoldIcon, _line2.IsHeld ? "Resume Call" : "Hold Call");
                SetLineIconButton(Line2MuteButton, _muted ? MutedMicIcon : MicIcon, _muted ? "Unmute Microphone" : "Mute Microphone", _muted ? "#EF4444" : "#1E293B");
                SetLineIconButton(Line2RecordButton, _sipRegistrationService.IsRecording ? "\uE73B" : RecordIcon, _sipRegistrationService.IsRecording ? "Stop Recording" : "Record Call", _sipRegistrationService.IsRecording ? "#EF4444" : "#1E293B");
                SetLineIconButton(Line2TransferButton, TransferIcon, "Transfer Call");
                SetLineIconButton(Line2ConferenceButton, ConferenceIcon, "Conference Calls");
                SetLineIconButton(Line2HangupButton, HangupIcon, "End Call");
            }
            else if (_line2.Status == "Calling")
            {
                Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F0FDF4")!;
                Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#93C5FD")!;
                Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#2563EB")!;

                Line2Card.Padding = new Thickness(14, 10, 14, 10);
                Line2InfoPanel.Visibility = Visibility.Visible;
                Line2ActionRow.Visibility = Visibility.Visible;
                Line2IncomingActionRow.Visibility = Visibility.Collapsed;
                Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#3B82F6")!;
                Line2StatusText.Text = "Calling...";
                Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#2563EB")!;
                Line2DetailText.Text = string.IsNullOrWhiteSpace(_line2.RemoteName) ? _line2.RemoteNumber : $"{_line2.RemoteName} ({_line2.RemoteNumber})";
                SetLineIconButton(Line2HoldResumeButton, HoldIcon, "Hold Call");
                SetLineIconButton(Line2MuteButton, MicIcon, "Mute Microphone", "#1E293B");
                SetLineIconButton(Line2RecordButton, RecordIcon, "Record Call", "#1E293B");
                SetLineIconButton(Line2TransferButton, TransferIcon, "Transfer Call");
                SetLineIconButton(Line2ConferenceButton, ConferenceIcon, "Conference Calls");
                SetLineIconButton(Line2HangupButton, HangupIcon, "End Call");
            }
            else if (_line2.Status == "Failed")
            {
                Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#FEF2F2")!;
                Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#FECACA")!;
                Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#DC2626")!;

                Line2Card.Padding = new Thickness(14, 10, 14, 10);
                Line2InfoPanel.Visibility = Visibility.Visible;
                Line2ActionRow.Visibility = Visibility.Collapsed;
                Line2IncomingActionRow.Visibility = Visibility.Collapsed;
                Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#EF4444")!;
                Line2StatusText.Text = "Call Failed";
                Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#DC2626")!;
                Line2DetailText.Text = _line2.RemoteNumber;
            }
            else // Idle
            {
                Line2Card.Padding = new Thickness(14, 10, 14, 10);
                Line2InfoPanel.Visibility = Visibility.Visible;
                Line2ActionRow.Visibility = Visibility.Collapsed;
                Line2IncomingActionRow.Visibility = Visibility.Collapsed;
                Line2DetailText.Text = "";

                if (_selectedLine == 2)
                {
                    Line2Card.Background = (WpfBrush)new BrushConverter().ConvertFromString("#F8FAFC")!;
                    Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#CBD5E1")!;
                    Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#475569")!;
                    Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
                    Line2StatusText.Text = "Line 2  •  Ready";
                    Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#475569")!;
                }
                else
                {
                    Line2Card.Background = WpfBrushes.White;
                    Line2Card.BorderBrush = (WpfBrush)new BrushConverter().ConvertFromString("#E2E8F0")!;
                    Line2BadgeText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
                    Line2StatusDot.Fill = (WpfBrush)new BrushConverter().ConvertFromString("#CBD5E1")!;
                    Line2StatusText.Text = "Line 2  •  Idle";
                    Line2StatusText.Foreground = (WpfBrush)new BrushConverter().ConvertFromString("#94A3B8")!;
                }
            }
        }
    }

    private async void SelectLine(int line)
    {
        if (line == _selectedLine) return;
        _selectedLine = line;

        if (line == 2)
        {
            if (_line1.Status == "Connected" && !_line1.IsHeld)
            {
                await HoldLine(1);
            }
            if (_line2.Status == "Connected" && _line2.IsHeld)
            {
                await ResumeLine(2);
            }

            DestinationTextBox.Text = _line2.RemoteNumber;
            if (string.IsNullOrWhiteSpace(_line2.RemoteNumber))
            {
                DestinationPreviewText.Text = "Enter a number";
                CallerLookupText.Text = "Line 2 selected";
            }
            else
            {
                DestinationPreviewText.Text = _line2.RemoteNumber;
                CallerLookupText.Text = _line2.RemoteName;
            }
        }
        else
        {
            if (_line2.Status == "Connected" && !_line2.IsHeld)
            {
                await HoldLine(2);
            }
            if (_line1.Status == "Connected" && _line1.IsHeld)
            {
                await ResumeLine(1);
            }

            DestinationTextBox.Text = _line1.RemoteNumber;
            if (string.IsNullOrWhiteSpace(_line1.RemoteNumber))
            {
                DestinationPreviewText.Text = "Enter a number";
                CallerLookupText.Text = "Line 1 selected";
            }
            else
            {
                DestinationPreviewText.Text = _line1.RemoteNumber;
                CallerLookupText.Text = _line1.RemoteName;
            }
        }

        UpdateCallControls();
        UpdateLineAppearances();
    }

    private async Task HoldLine(int line)
    {
        var targetLine = line == 1 ? _line1 : _line2;
        if (!targetLine.HasCall || targetLine.IsHeld) return;

        targetLine.IsHeld = true;
        _held = true;
        await _sipRegistrationService.HoldLineAsync(line, true);
        UpdateInCallButtonIcons();
        UpdateLineAppearances();
        FooterStatusText.Text = $"Line {line} placed on hold.";
    }

    private async Task ResumeLine(int line)
    {
        var targetLine = line == 1 ? _line1 : _line2;
        if (!targetLine.HasCall || !targetLine.IsHeld) return;

        targetLine.IsHeld = false;
        _held = false;
        await _sipRegistrationService.HoldLineAsync(line, false);
        UpdateInCallButtonIcons();
        UpdateLineAppearances();
        FooterStatusText.Text = $"Line {line} resumed.";
    }

    private void Line1Card_MouseDown(object sender, MouseButtonEventArgs e)
    {
        SelectLine(1);
    }

    private void Line2Card_MouseDown(object sender, MouseButtonEventArgs e)
    {
        SelectLine(2);
    }

    private async void Line1HoldResumeButton_Click(object sender, RoutedEventArgs e)
    {
        if (_line1.IsHeld)
        {
            await ResumeLine(1);
        }
        else
        {
            await HoldLine(1);
        }
    }

    private async void Line2HoldResumeButton_Click(object sender, RoutedEventArgs e)
    {
        if (_line2.IsHeld)
        {
            await ResumeLine(2);
        }
        else
        {
            await HoldLine(2);
        }
    }

    private async void Line1HangupButton_Click(object sender, RoutedEventArgs e)
    {
        CloseVideoCallWindow();
        _line1.Status = "Idle";
        _line1.RemoteNumber = "";
        _line1.RemoteName = "";
        _line1.ConnectedAt = null;
        _line1.IsHeld = false;
        await _sipRegistrationService.EndLineCallAsync(1);
        if (_line2.HasCall)
        {
            SelectLine(2);
        }
        else
        {
            _selectedLine = 1;
            _callInProgress = false;
            _callConnected = false;
            StopCallTimer();
            ClearDialpadAfterCall();
            SetPresenceDisplay(_userSelectedPresence);
        }
        UpdateCallControls();
        UpdateLineAppearances();
    }

    private async void Line2HangupButton_Click(object sender, RoutedEventArgs e)
    {
        CloseVideoCallWindow();
        _line2.Status = "Idle";
        _line2.RemoteNumber = "";
        _line2.RemoteName = "";
        _line2.ConnectedAt = null;
        _line2.IsHeld = false;
        await _sipRegistrationService.EndLineCallAsync(2);
        if (_line1.HasCall)
        {
            SelectLine(1);
        }
        else
        {
            _selectedLine = 1;
            _callInProgress = false;
            _callConnected = false;
            StopCallTimer();
            ClearDialpadAfterCall();
            SetPresenceDisplay(_userSelectedPresence);
        }
        UpdateCallControls();
        UpdateLineAppearances();
    }

    private async void Line2AnswerButton_Click(object sender, RoutedEventArgs e)
    {
        if (_line1.Status == "Connected" && !_line1.IsHeld)
        {
            await HoldLine(1);
        }
        _selectedLine = 2;
        AnswerIncomingCall();
        UpdateLineAppearances();
    }

    private void Line2DeclineButton_Click(object sender, RoutedEventArgs e)
    {
        _line2.Status = "Idle";
        _line2.RemoteNumber = "";
        _line2.RemoteName = "";
        _line2.ConnectedAt = null;
        DeclineIncomingCall();
        UpdateLineAppearances();
    }

    private void Line1MuteButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 1) SelectLine(1);
        MuteButton_Click(sender, e);
        UpdateLineAppearances();
    }

    private void Line1TransferButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 1) SelectLine(1);
        TransferButton_Click(sender, e);
    }

    private void Line1ConferenceButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 1) SelectLine(1);
        ConferenceButton_Click(sender, e);
    }

    private void Line1RecordButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 1) SelectLine(1);
        RecordButton_Click(sender, e);
        UpdateLineAppearances();
    }

    private void Line2MuteButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 2) SelectLine(2);
        MuteButton_Click(sender, e);
        UpdateLineAppearances();
    }

    private void Line2TransferButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 2) SelectLine(2);
        TransferButton_Click(sender, e);
    }

    private void Line2ConferenceButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 2) SelectLine(2);
        ConferenceButton_Click(sender, e);
    }

    private void Line2RecordButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedLine != 2) SelectLine(2);
        RecordButton_Click(sender, e);
        UpdateLineAppearances();
    }


    // ==========================================
    // MERLINBETA SUITE: VU METER, AUTO-ANSWER, DND, CALLER ID, CSV IMPORT/EXPORT
    // ==========================================
    private NAudio.Wave.WaveIn? _micVuWaveIn;

    private void StartMicVuMeter()
    {
        StopMicVuMeter();
        try
        {
            if (NAudio.Wave.WaveIn.DeviceCount <= 0) return;
            int deviceId = 0;
            if (AudioInputComboBox.SelectedItem is MediaDeviceInfo dev && int.TryParse(dev.Id, out var parsed))
            {
                deviceId = Math.Clamp(parsed, 0, NAudio.Wave.WaveIn.DeviceCount - 1);
            }
            else if (AudioInputComboBox.SelectedIndex >= 0)
            {
                deviceId = Math.Clamp(AudioInputComboBox.SelectedIndex, 0, NAudio.Wave.WaveIn.DeviceCount - 1);
            }

            _micVuWaveIn = new NAudio.Wave.WaveIn
            {
                DeviceNumber = deviceId,
                WaveFormat = new NAudio.Wave.WaveFormat(8000, 16, 1)
            };
            _micVuWaveIn.DataAvailable += (s, a) =>
            {
                float max = 0;
                for (int i = 0; i < a.BytesRecorded; i += 2)
                {
                    short sample = (short)((a.Buffer[i + 1] << 8) | a.Buffer[i]);
                    float sample32 = Math.Abs(sample / 32768f);
                    if (sample32 > max) max = sample32;
                }
                int level = Math.Min(100, (int)(max * 150));
                Dispatcher.InvokeAsync(() =>
                {
                    if (MicLevelProgressBar != null)
                    {
                        MicLevelProgressBar.Value = level;
                    }
                }, System.Windows.Threading.DispatcherPriority.Background);
            };
            _micVuWaveIn.StartRecording();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Mic VU meter start failed: {ex.Message}");
        }
    }

    private void StopMicVuMeter()
    {
        try
        {
            if (_micVuWaveIn != null)
            {
                _micVuWaveIn.StopRecording();
                _micVuWaveIn.Dispose();
                _micVuWaveIn = null;
            }
        }
        catch { }
        if (MicLevelProgressBar != null)
        {
            MicLevelProgressBar.Value = 0;
        }
    }

    private void AutoAnswerPill_MouseDown(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _config = _config with { AutoAnswerEnabled = !_config.AutoAnswerEnabled };
        _ = _cacheService.SaveSettingsAsync(_config);
        UpdateAutoAnswerUi();
    }

    private void AutoAnswerCheckBox_Click(object sender, RoutedEventArgs e)
    {
        _config = _config with { AutoAnswerEnabled = AutoAnswerCheckBox.IsChecked == true };
        _ = _cacheService.SaveSettingsAsync(_config);
        UpdateAutoAnswerUi();
    }

    private void UpdateAutoAnswerUi()
    {
        if (AutoAnswerDot != null && AutoAnswerText != null && AutoAnswerPill != null)
        {
            if (_config.AutoAnswerEnabled)
            {
                AutoAnswerDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(16, 185, 129));
                AutoAnswerText.Text = "Auto Answer: ON";
                AutoAnswerText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(4, 120, 87));
                AutoAnswerPill.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(209, 250, 229));
            }
            else
            {
                AutoAnswerDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(148, 163, 184));
                AutoAnswerText.Text = "Auto Answer: OFF";
                AutoAnswerText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(100, 116, 139));
                AutoAnswerPill.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(241, 245, 249));
            }
        }
        if (AutoAnswerCheckBox != null)
        {
            AutoAnswerCheckBox.IsChecked = _config.AutoAnswerEnabled;
        }
    }

    private async void DndPill_MouseDown(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        await ToggleDndAsync();
    }

    private void UpdateDndUi()
    {
        if (DndDot != null && DndText != null && DndPill != null)
        {
            if (_dndEnabled)
            {
                DndDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(239, 68, 68));
                DndText.Text = "DND: ON";
                DndText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(185, 28, 28));
                DndPill.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(254, 226, 226));
            }
            else
            {
                DndDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(148, 163, 184));
                DndText.Text = "DND: OFF";
                DndText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(100, 116, 139));
                DndPill.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(241, 245, 249));
            }
        }
    }

    private void UpdateUserBadge()
    {
        var ext = !string.IsNullOrWhiteSpace(_config.Extension) ? _config.Extension : "100";
        var rawName = !string.IsNullOrWhiteSpace(_config.Username) ? _config.Username : (!string.IsNullOrWhiteSpace(_config.Extension) ? _config.Extension : "");

        if (UserDisplayNameText != null)
        {
            if (!string.IsNullOrWhiteSpace(rawName) && !string.Equals(rawName, ext, StringComparison.OrdinalIgnoreCase))
            {
                UserDisplayNameText.Text = $"{rawName} ({ext})";
            }
            else
            {
                UserDisplayNameText.Text = $"Ext {ext}";
            }
        }

        // Clean avatar: show initials if alphabetical name, otherwise show clean person icon &#xE77B; (never awkward "50" from numeric ext)
        if (UserAvatarIcon != null && UserAvatarText != null)
        {
            if (!string.IsNullOrWhiteSpace(rawName) && rawName.Any(char.IsLetter))
            {
                var parts = rawName.Split(new char[] { ' ', '.', '_', '-' }, StringSplitOptions.RemoveEmptyEntries);
                var initials = parts.Length >= 2
                    ? $"{parts[0][0]}{parts[1][0]}".ToUpperInvariant()
                    : rawName[..Math.Min(2, rawName.Length)].ToUpperInvariant();
                UserAvatarText.Text = initials;
                UserAvatarText.Visibility = Visibility.Visible;
                UserAvatarIcon.Visibility = Visibility.Collapsed;
            }
            else
            {
                UserAvatarIcon.Visibility = Visibility.Visible;
                UserAvatarText.Visibility = Visibility.Collapsed;
            }
        }

        // Presence & Registration alignment
        if (!_registered)
        {
            if (HeaderPresenceDot != null)
            {
                HeaderPresenceDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(148, 163, 184));
                HeaderPresenceDot.Visibility = Visibility.Visible;
            }
            if (HeaderPresenceText != null)
            {
                HeaderPresenceText.Text = "Offline";
                HeaderPresenceText.Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(148, 163, 184));
            }
        }
        else
        {
            UpdateMainPresenceDisplayOnly(_userSelectedPresence);
        }
    }



    private void CallbackHistoryButton_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if (sender is FrameworkElement { Tag: CallHistoryEntry entry })
        {
            RedialCall(entry);
        }
    }

    private void VideoSourceComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (VideoSourceComboBox.SelectedItem is MediaDeviceInfo dev)
        {
            CameraStatusText.Text = $"Camera ready: {dev.Name}";
        }
    }

    private CameraPreviewWindow? _cameraPreview;

    private void CameraPreviewFrame_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (sender is not FrameworkElement frame || frame.ActualWidth <= 0)
        {
            return;
        }

        var height = Math.Round(frame.ActualWidth * 9 / 16);
        if (Math.Abs(frame.Height - height) > 0.5)
        {
            frame.Height = height;
        }
    }

    private void TestCameraButton_Click(object sender, RoutedEventArgs e)
    {
        var dev = VideoSourceComboBox.SelectedItem as MediaDeviceInfo ?? _config.VideoSource ?? new MediaDeviceInfo("default-video", "Default camera");
        _cameraPreview?.Close();

        var preview = new CameraPreviewWindow(dev) { Owner = this };
        _cameraPreview = preview;
        preview.PreviewUpdated += source =>
        {
            CameraPreviewImage.Source = source;
            CameraPreviewPlaceholder.Visibility = Visibility.Collapsed;
        };
        preview.PreviewFailed += message =>
        {
            CameraStatusText.Text = message;
            CameraPreviewPlaceholder.Text = message;
            CameraPreviewPlaceholder.Visibility = CameraPreviewImage.Source is null ? Visibility.Visible : Visibility.Collapsed;
            NoticeText.Text = message;
            NoticeText.Visibility = Visibility.Visible;
        };
        preview.Closed += (_, _) =>
        {
            if (ReferenceEquals(_cameraPreview, preview))
            {
                _cameraPreview = null;
            }
        };
        preview.Show();
        preview.Activate();
        CameraStatusText.Text = $"Previewing {dev.Name}.";
        NoticeText.Text = $"Showing {dev.Name}.";
        NoticeText.Visibility = Visibility.Visible;
    }

    private void StartVideoCallContactButton_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if (sender is FrameworkElement { Tag: ContactEntry entry })
        {
            VideoCallContact(entry);
        }
    }

    private async void VideoCallContact(ContactEntry contact)
    {
        UseSelectedContact(contact);
        await StartOutboundCallAsync(contact.Number, isVideo: true);
    }

    private async void UseSelectedContactVideoCallButton_Click(object sender, RoutedEventArgs e)
    {
        if (PhonebookContactsListView.SelectedItem is ContactEntry contact)
        {
            VideoCallContact(contact);
        }
        else if (!string.IsNullOrWhiteSpace(DestinationTextBox.Text))
        {
            await StartOutboundCallAsync(DestinationTextBox.Text, isVideo: true);
        }
        else
        {
            NoticeText.Text = "Select a contact or enter a number for video call.";
        }
    }

    private async void VideoDialButton_Click(object sender, RoutedEventArgs e)
    {
        await StartOutboundCallAsync(DestinationTextBox.Text, isVideo: true);
    }

    private void VideoBadge_MouseDown(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        ShowVideoCallWindow();
    }

    private void ShowVideoCallWindow()
    {
        if (_videoCallWindow != null && _videoCallWindow.IsVisible)
        {
            _videoCallWindow.Activate();
            return;
        }

        var contact = _contactStore.FindByNumber(_contacts, _activeRemoteNumber);
        var name = contact?.Name ?? _activeRemoteNumber;
        var window = new VideoCallWindow(name, _activeRemoteNumber, _sipRegistrationService.VideoSession);
        window.SyncMicrophone(_muted);
        window.EndCallRequested += (_, _) =>
        {
            Dispatcher.InvokeAsync(async () =>
            {
                var result = await _sipRegistrationService.EndCallAsync();
                FooterStatusText.Text = result.Message;
                await OnCallFinished("Ended", string.IsNullOrWhiteSpace(result.Message) ? "Video call ended." : result.Message);
            });
        };
        window.MuteMicRequested += (_, muted) =>
        {
            Dispatcher.InvokeAsync(() => ApplyMicrophoneMuted(muted));
        };
        window.ToggleCameraRequested += (_, muted) =>
        {
            Dispatcher.InvokeAsync(() =>
            {
                _sipRegistrationService.SetVideoMuted(muted);
                FooterStatusText.Text = muted ? "Camera off." : "Camera on.";
            });
        };
        window.Closed += (_, _) =>
        {
            if (ReferenceEquals(_videoCallWindow, window))
            {
                _videoCallWindow = null;
            }
        };
        _videoCallWindow = window;
        window.Show();
    }

    private void ApplyMicrophoneMuted(bool muted)
    {
        if (!_sipRegistrationService.CanControlAudio)
        {
            FooterStatusText.Text = "Connect a call before muting.";
            _videoCallWindow?.SyncMicrophone(_muted);
            return;
        }

        if (_muted == muted)
        {
            UpdateLineAppearances();
            return;
        }

        _muted = muted;
        _sipRegistrationService.SetMuted(_muted);
        UpdateInCallButtonIcons();
        UpdateLineAppearances();
        FooterStatusText.Text = _muted ? "Microphone muted." : "Microphone unmuted.";
    }

    private void CloseVideoCallWindow()
    {
        _currentCallIsVideo = false;
        Line1VideoBadge.Visibility = Visibility.Collapsed;
        Line2VideoBadge.Visibility = Visibility.Collapsed;
        var window = _videoCallWindow;
        _videoCallWindow = null;
        if (window == null)
        {
            return;
        }

        try
        {
            window.Close();
        }
        catch
        {
            // Window may already be closing from the end-call button.
        }
    }

    private void CallbackContactButton_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if (sender is FrameworkElement { Tag: ContactEntry entry })
        {
            CallContact(entry);
        }
    }

    private async void ImportContactsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var dialog = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "Contacts (*.csv;*.xml)|*.csv;*.xml|CSV files (*.csv)|*.csv|XML files (*.xml)|*.xml",
                Title = "Import contacts"
            };
            if (dialog.ShowDialog(this) != true)
            {
                return;
            }

            var fileName = dialog.FileName;
            var sheet = await Task.Run(() => ContactImportReader.Read(fileName));
            if (sheet.Columns.Count == 0 || sheet.Rows.Count == 0)
            {
                NoticeText.Text = "That file has no contacts to import.";
                NoticeText.Visibility = Visibility.Visible;
                return;
            }

            var mapper = new ImportContactsWindow(sheet, System.IO.Path.GetFileName(fileName))
            {
                Owner = this
            };
            if (mapper.ShowDialog() != true)
            {
                return;
            }

            var existingIndexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < _contacts.Count; index++)
            {
                var number = _contacts[index].Number;
                if (!string.IsNullOrWhiteSpace(number) && !existingIndexes.ContainsKey(number))
                {
                    existingIndexes[number] = index;
                }
            }

            var added = 0;
            var updated = 0;
            var skipped = 0;
            foreach (var contact in mapper.ImportedContacts)
            {
                if (existingIndexes.TryGetValue(contact.Number, out var index))
                {
                    if (!mapper.UpdateExisting)
                    {
                        skipped++;
                        continue;
                    }

                    _contacts[index] = contact with { Presence = _contacts[index].Presence };
                    updated++;
                    continue;
                }

                _contacts.Add(contact);
                existingIndexes[contact.Number] = _contacts.Count - 1;
                added++;
            }

            await _contactStore.SaveAsync(_contacts);
            ApplyGlobalSearchFilter();
            _ = RefreshPresenceSubscriptionsAsync();
            NoticeText.Text = $"Imported {added} contacts. Updated {updated}. Skipped {skipped} already in the book. {_contacts.Count} contacts saved.";
            NoticeText.Visibility = Visibility.Visible;
            FooterStatusText.Text = NoticeText.Text;
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Import contacts failed: {ex.Message}");
            NoticeText.Text = $"Import failed: {ex.Message}";
            NoticeText.Visibility = Visibility.Visible;
        }
    }

    private async void ExportContactsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var dialog = new Microsoft.Win32.SaveFileDialog
            {
                Filter = "CSV Files (*.csv)|*.csv",
                FileName = "contacts.csv",
                Title = "Export Contacts to CSV"
            };
            if (dialog.ShowDialog(this) == true)
            {
                await ContactStore.ExportCsvAsync(_contacts, dialog.FileName);
                NoticeText.Text = $"Exported {_contacts.Count} contacts to {System.IO.Path.GetFileName(dialog.FileName)}.";
                NoticeText.Visibility = Visibility.Visible;
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Export CSV failed: {ex.Message}");
            NoticeText.Text = $"Export failed: {ex.Message}";
            NoticeText.Visibility = Visibility.Visible;
        }
    }
}
