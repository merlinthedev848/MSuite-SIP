using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;

namespace MerlinSip.Mac;

public sealed class AppHost : IDisposable
{
    private FileStream? _instanceLock;
    private readonly Timer _commandTimer;
    private string? _pendingDial;

    public AppHost()
    {
        Store = new DeskStore();
        DeskLog.Bind(Store.LogPath);
        Engine = new MacSipEngine(Store);
        _commandTimer = new Timer(_ => DrainCommand(), null, 800, 800);
    }

    public DeskStore Store { get; }
    public MacSipEngine Engine { get; }
    public bool HasAccount => Store.Config.SetupComplete && !string.IsNullOrWhiteSpace(Store.Config.Extension);

    public event Action<string>? DialRequested;

    public bool TryBecomePrimary(string[]? args)
    {
        var lockPath = Path.Combine(Store.DirectoryPath, "instance.lock");
        try
        {
            _instanceLock = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        }
        catch (IOException)
        {
            var dial = ExtractDial(args);
            File.WriteAllText(Path.Combine(Store.DirectoryPath, "command.txt"), string.IsNullOrWhiteSpace(dial) ? "activate" : dial);
            return false;
        }

        _pendingDial = ExtractDial(args);
        return true;
    }

    public void Start()
    {
        Engine.Start();
        if (!string.IsNullOrWhiteSpace(_pendingDial))
        {
            var number = _pendingDial;
            _pendingDial = null;
            DialRequested?.Invoke(number);
        }
    }

    public static string? ExtractDial(string[]? args)
    {
        var raw = args?.FirstOrDefault(arg =>
            arg.StartsWith("tel:", StringComparison.OrdinalIgnoreCase) ||
            arg.StartsWith("sip:", StringComparison.OrdinalIgnoreCase) ||
            arg.StartsWith("callto:", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var value = raw;
        var colon = value.IndexOf(':');
        if (colon >= 0)
        {
            value = value[(colon + 1)..];
        }

        value = Uri.UnescapeDataString(value).Trim().Trim('/');
        var at = value.IndexOf('@');
        if (at > 0)
        {
            value = value[..at];
        }

        return new string(value.Where(ch => char.IsDigit(ch) || ch is '+' or '*' or '#').ToArray());
    }

    private void DrainCommand()
    {
        var path = Path.Combine(Store.DirectoryPath, "command.txt");
        if (!File.Exists(path))
        {
            return;
        }

        string text;
        try
        {
            text = File.ReadAllText(path).Trim();
            File.Delete(path);
        }
        catch
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(text) || text == "activate")
        {
            DialRequested?.Invoke("");
            return;
        }

        DialRequested?.Invoke(text);
    }

    public void Dispose()
    {
        _commandTimer.Dispose();
        Engine.Dispose();
        _instanceLock?.Dispose();
    }
}

public class Program
{
    [STAThread]
    public static void Main(string[] args) =>
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
