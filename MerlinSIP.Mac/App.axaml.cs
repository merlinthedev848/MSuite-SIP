using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;

namespace MerlinSip.Mac;

public class App : Application
{
    private AppHost? _host;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            _host = new AppHost();
            if (!_host.TryBecomePrimary(desktop.Args))
            {
                desktop.Shutdown();
                return;
            }

            desktop.Exit += (_, _) => _host.Dispose();
            if (_host.HasAccount)
            {
                ShowMain(desktop, _host);
                _host.Start();
            }
            else
            {
                var startup = new StartupWindow(_host);
                desktop.MainWindow = startup;
                startup.Show();
                startup.Closed += (_, _) =>
                {
                    if (startup.Accepted && _host.HasAccount)
                    {
                        ShowMain(desktop, _host);
                        _host.Start();
                    }
                    else if (desktop.MainWindow == startup)
                    {
                        desktop.Shutdown();
                    }
                };
            }
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static void ShowMain(IClassicDesktopStyleApplicationLifetime desktop, AppHost host)
    {
        var main = new MainWindow(host);
        desktop.MainWindow = main;
        main.Show();
        main.Closed += (_, _) => desktop.Shutdown();
    }
}
