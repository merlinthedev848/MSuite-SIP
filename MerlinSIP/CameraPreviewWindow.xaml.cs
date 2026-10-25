using System.ComponentModel;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip;

public partial class CameraPreviewWindow : Window
{
    private readonly MediaDeviceInfo _device;
    private readonly DispatcherTimer _watchdog = new() { Interval = TimeSpan.FromSeconds(6) };
    private CameraPreviewSession? _session;
    private WriteableBitmap? _bitmap;
    private int _closing;

    public event Action<ImageSource>? PreviewUpdated;
    public event Action<string>? PreviewFailed;

    public CameraPreviewWindow(MediaDeviceInfo device)
    {
        _device = device;
        InitializeComponent();
        CameraNameText.Text = device.Name;
        Title = $"Camera preview - {device.Name}";
        Topmost = true;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _watchdog.Tick += Watchdog_Tick;
        _watchdog.Start();
        _session = new CameraPreviewSession();
        _session.FrameReady += OnFrameReady;
        _session.Failed += OnFailed;
        await _session.StartAsync(_device);
    }

    private void Watchdog_Tick(object? sender, EventArgs e)
    {
        _watchdog.Stop();
        if (PreviewImage.Source is null && StatusText.Text == "Starting camera...")
        {
            OnFailed("The camera did not send a picture. Close other apps using it and try again.");
        }
    }

    private void OnFrameReady(int width, int height, byte[] pixels)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => OnFrameReady(width, height, pixels));
            return;
        }

        try
        {
            if (_bitmap is null || _bitmap.PixelWidth != width || _bitmap.PixelHeight != height)
            {
                _bitmap = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgra32, null);
                PreviewImage.Source = _bitmap;
            }

            _bitmap.WritePixels(new Int32Rect(0, 0, width, height), pixels, width * 4, 0);
            StatusText.Visibility = Visibility.Collapsed;
            _watchdog.Stop();
            Topmost = false;
            PreviewUpdated?.Invoke(_bitmap);
        }
        finally
        {
            _session?.ReleaseFrameSlot();
        }
    }

    private void OnFailed(string message)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => OnFailed(message));
            return;
        }

        _watchdog.Stop();
        Topmost = false;
        if (PreviewImage.Source is null)
        {
            StatusText.Text = message;
            StatusText.Visibility = Visibility.Visible;
        }

        PreviewFailed?.Invoke(message);
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (Interlocked.Exchange(ref _closing, 1) != 0)
        {
            return;
        }

        e.Cancel = true;
        _watchdog.Stop();
        var session = _session;
        _session = null;
        if (session is not null)
        {
            session.FrameReady -= OnFrameReady;
            session.Failed -= OnFailed;
            try
            {
                await session.StopAsync();
            }
            catch
            {
            }
        }

        Close();
    }
}
