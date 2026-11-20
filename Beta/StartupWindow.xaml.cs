using System.Windows;
using System.Windows.Controls;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip;

public partial class StartupWindow : Window
{
    private readonly LicenseService _licenseService = new();
    private readonly DeviceDiscoveryService _deviceDiscoveryService = new();
    private readonly ProvisioningService _provisioningService = new();
    private string _licenseKey = string.Empty;
    private string _licenseStatus = "Licensed";
    private ContractorProfileResponse? _contractorProfile;
    private bool _isManualMode;

    public AppStartupConfig? Config { get; private set; }

    public StartupWindow()
    {
        InitializeComponent();
        MaxHeight = SystemParameters.WorkArea.Height;
        Loaded += StartupWindow_Loaded;
    }

    private void StartupWindow_Loaded(object sender, RoutedEventArgs e)
    {
        LoadMediaDevices();
        UpdateUiMode();
    }

    private void LoadMediaDevices()
    {
        AudioInputComboBox.ItemsSource = _deviceDiscoveryService.GetAudioInputs();
        AudioOutputComboBox.ItemsSource = _deviceDiscoveryService.GetAudioOutputs();

        AudioInputComboBox.SelectedIndex = AudioInputComboBox.Items.Count > 0 ? 0 : -1;
        AudioOutputComboBox.SelectedIndex = AudioOutputComboBox.Items.Count > 0 ? 0 : -1;
    }

    private void UpdateUiMode()
    {
        if (!_isManualMode)
        {
            ProvisionCodePanel.Visibility = Visibility.Visible;
            ManualSipPanel.Visibility = Visibility.Collapsed;
            SubtitleText.Text = "Enter your 8-digit provisioning code to activate and connect.";
            ContinueButton.Content = "Activate & Connect";
            SwitchModeButton.Content = "Need manual SIP setup or standalone licence key? Click here";
        }
        else
        {
            ProvisionCodePanel.Visibility = Visibility.Collapsed;
            ManualSipPanel.Visibility = Visibility.Visible;
            SubtitleText.Text = "Enter your manual SIP credentials and standalone licence key.";
            ContinueButton.Content = "Connect Manual SIP";
            SwitchModeButton.Content = "← Back to Quick 8-Digit Provisioning Code";
            PrivatePbxPanel.Visibility = Visibility.Visible;
            if (string.IsNullOrWhiteSpace(PrivatePbxTextBox.Text))
            {
                PrivatePbxTextBox.Text = AppStartupConfig.FixedSipServer;
            }
        }
    }

    private void SwitchModeButton_Click(object sender, RoutedEventArgs e)
    {
        _isManualMode = !_isManualMode;
        ErrorText.Text = string.Empty;
        UpdateUiMode();
    }

    private async void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = string.Empty;

        try
        {
            await RunWithDisabledContinueAsync(async () =>
            {
                if (!_isManualMode)
                {
                    await AcceptProvisioningStepAsync();
                }
                else
                {
                    await AcceptManualSipStepAsync();
                }
            });
        }
        catch (Exception ex)
        {
            DebugLog.Write($"STARTUP ContinueButton_Click failed: {ex}");
            ErrorText.Text = $"Setup failed: {ex.Message}";
        }
    }

    private async Task RunWithDisabledContinueAsync(Func<Task> action)
    {
        ContinueButton.IsEnabled = false;
        try
        {
            await action();
        }
        finally
        {
            ContinueButton.IsEnabled = true;
        }
    }

    private async Task AcceptProvisioningStepAsync()
    {
        if (AudioInputComboBox.SelectedItem is not MediaDeviceInfo audioInput ||
            AudioOutputComboBox.SelectedItem is not MediaDeviceInfo audioOutput)
        {
            ErrorText.Text = "Select audio input and audio output devices.";
            return;
        }

        var provisionCode = ProvisioningCodeTextBox.Text?.Trim() ?? string.Empty;
        var cleanedCode = new string(provisionCode.Where(char.IsDigit).ToArray());
        if (cleanedCode.Length != 8)
        {
            ErrorText.Text = "Enter a valid 8-digit provisioning code.";
            return;
        }

        ContinueButton.Content = "Activating & Connecting...";
        var provisioned = await _provisioningService.ProvisionAsync(
            cleanedCode,
            audioInput,
            audioOutput,
            customHandlerUrl: _contractorProfile?.HandlerUrl);

        if (!provisioned.Success || provisioned.Config is null)
        {
            ErrorText.Text = provisioned.Message;
            ContinueButton.Content = "Activate & Connect";
            return;
        }

        Config = provisioned.Config;
        DialogResult = true;
    }

    private async Task AcceptManualSipStepAsync()
    {
        if (AudioInputComboBox.SelectedItem is not MediaDeviceInfo audioInput ||
            AudioOutputComboBox.SelectedItem is not MediaDeviceInfo audioOutput)
        {
            ErrorText.Text = "Select audio input and audio output devices.";
            return;
        }

        var licenseKey = LicenseKeyTextBox.Text?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(licenseKey))
        {
            ContinueButton.Content = "Checking licence...";
            var activation = await _licenseService.ActivateAsync(licenseKey);
            if (!activation.Success)
            {
                ErrorText.Text = activation.Message;
                ContinueButton.Content = "Connect Manual SIP";
                return;
            }
            _licenseKey = licenseKey;
            _licenseStatus = _licenseService.Status;
            _contractorProfile = activation.Profile;
        }
        else
        {
            _licenseKey = "MANUAL-STANDALONE";
            _licenseStatus = "Licensed";
        }

        var extension = ExtensionTextBox.Text.Trim();
        var username = UsernameTextBox.Text.Trim();
        var password = PasswordBox.Password;
        var server = !string.IsNullOrWhiteSpace(PrivatePbxTextBox.Text) ? PrivatePbxTextBox.Text.Trim() : AppStartupConfig.FixedSipServer;

        if (string.IsNullOrWhiteSpace(server))
        {
            ErrorText.Text = "Enter the SIP server.";
            return;
        }

        if (string.IsNullOrWhiteSpace(extension))
        {
            ErrorText.Text = "Enter the extension or user ID.";
            return;
        }

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            ErrorText.Text = "Enter the authentication username and password.";
            return;
        }

        var dataHandlerUrl = _contractorProfile?.HandlerUrl ?? AppStartupConfig.DefaultDataHandlerUrl;
        var brandName = _contractorProfile?.CompanyName ?? "MerlinSIP";
        var port = _contractorProfile?.SipPort is > 0 ? _contractorProfile.SipPort.Value : AppStartupConfig.FixedSipPort;

        Config = new AppStartupConfig(
            server,
            port,
            server,
            extension,
            username,
            password,
            _licenseKey,
            _licenseStatus,
            audioInput,
            audioOutput,
            LicenseLocalKey: _licenseService.LocalKey ?? string.Empty,
            DataHandlerUrl: dataHandlerUrl,
            BrandName: brandName).WithFixedSipEndpoint();

        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}
