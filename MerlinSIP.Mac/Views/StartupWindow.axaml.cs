using Avalonia.Controls;
using Avalonia.Interactivity;

namespace MerlinSip.Mac;

public partial class StartupWindow : Window
{
    public StartupWindow() : this(new AppHost()) { }
    private readonly AppHost _host;

    public StartupWindow(AppHost host)
    {
        _host = host;
        InitializeComponent();
        ProvisionRadio.IsCheckedChanged += (_, _) => ShowMode();
        ManualRadio.IsCheckedChanged += (_, _) => ShowMode();
        LicenseBox.PropertyChanged += (_, e) =>
        {
            if (e.Property.Name == nameof(TextBox.Text))
            {
                var text = (LicenseBox.Text ?? "").Trim();
                var isBuyout = text.StartsWith("PR", StringComparison.OrdinalIgnoreCase) ||
                               text.StartsWith("BUYOUT", StringComparison.OrdinalIgnoreCase);
                if (isBuyout)
                {
                    ProvisionRadio.IsEnabled = false;
                    ProvisionRadio.IsVisible = false;
                    ManualRadio.IsChecked = true;
                }
                else
                {
                    ProvisionRadio.IsEnabled = true;
                    ProvisionRadio.IsVisible = true;
                }
            }
        };
        var icon = Path.Combine(AppContext.BaseDirectory, "Assets", "CKMedia-Icon.png");
        if (File.Exists(icon))
        {
            Icon = new WindowIcon(icon);
        }
    }

    public bool Accepted { get; private set; }

    private void ShowMode()
    {
        var manual = ManualRadio.IsChecked == true;
        ManualPanel.IsVisible = manual;
        ProvisionPanel.IsVisible = !manual;
    }

    private async void Continue_Click(object? sender, RoutedEventArgs e)
    {
        ErrorText.Text = "Checking the license…";
        var license = await new LicenseClient().ActivateAsync(LicenseBox.Text ?? "");
        if (!license.Ok)
        {
            ErrorText.Text = license.Error;
            return;
        }

        var config = _host.Store.Config;
        config.LicenseKey = (LicenseBox.Text ?? "").Trim();
        config.LicenseStatus = license.Status;
        config.LicenseLocalKey = license.LocalKey ?? "";
        if (config.AllowsCustomServer && ManualRadio.IsChecked != true)
        {
            ErrorText.Text = "Provisioning PIN codes are reserved for managed cloud accounts. Please use SIP account setup for buyout licenses.";
            return;
        }

        if (ManualRadio.IsChecked == true)
        {
            config.DisplayName = NameBox.Text?.Trim() ?? "";
            config.Server = string.IsNullOrWhiteSpace(ServerBox.Text) ? AppVersion.FixedServer : ServerBox.Text.Trim();
            config.Domain = config.Server;
            config.Extension = ExtensionBox.Text?.Trim() ?? "";
            config.Username = string.IsNullOrWhiteSpace(UsernameBox.Text) ? config.Extension : UsernameBox.Text.Trim();
            config.Password = PasswordBox.Text ?? "";
            config.Port = int.TryParse(PortBox.Text, out var port) ? port : 5060;
            config.Transport = (TransportBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "UDP";
            if (string.IsNullOrWhiteSpace(config.Extension) || string.IsNullOrWhiteSpace(config.Password))
            {
                ErrorText.Text = "Enter the extension and password.";
                return;
            }
        }
        else
        {
            ErrorText.Text = "Provisioning the extension…";
            var provisioned = await new ProvisionClient().ProvisionAsync(CodeBox.Text ?? "");
            if (!provisioned.Ok)
            {
                ErrorText.Text = provisioned.Error;
                return;
            }

            config.Extension = provisioned.Extension;
            config.Username = provisioned.Username;
            config.Password = provisioned.Password;
            config.Server = AppVersion.FixedServer;
            config.Domain = AppVersion.FixedServer;
            config.Port = AppVersion.FixedPort;
            config.Transport = "UDP";
            config.IsProvisioned = true;
        }

        config.ApplyFixedEndpoint();
        config.SetupComplete = true;
        _host.Store.SaveConfig();
        Accepted = true;
        Close();
    }
}
