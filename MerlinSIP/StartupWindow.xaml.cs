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
    private bool _licenseAccepted;
    private bool _allowCustomSipEndpoint;

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
        if (ProvisionCodeRadioButton.IsChecked == true)
        {
            ProvisionCodePanel.Visibility = Visibility.Visible;
            LicenseStepPanel.Visibility = Visibility.Collapsed;
            ManualSipPanel.Visibility = Visibility.Collapsed;
            SubtitleText.Text = "Enter your 8-digit setup PIN to automatically provision this softphone.";
            ContinueButton.Content = "Connect & Setup";
        }
        else
        {
            ProvisionCodePanel.Visibility = Visibility.Collapsed;
            if (!_licenseAccepted)
            {
                LicenseStepPanel.Visibility = Visibility.Visible;
                ManualSipPanel.Visibility = Visibility.Collapsed;
                SubtitleText.Text = "Enter your buyout or contractor licence key to activate.";
                ContinueButton.Content = "Activate licence";
            }
            else
            {
                LicenseStepPanel.Visibility = Visibility.Collapsed;
                ManualSipPanel.Visibility = Visibility.Visible;
                SubtitleText.Text = "Enter your SIP account credentials.";
                ContinueButton.Content = "Complete setup";
            }
        }
    }

    private async void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = string.Empty;

        try
        {
            if (ProvisionCodeRadioButton.IsChecked == true)
            {
                await RunWithDisabledContinueAsync(AcceptProvisionCodeStep);
                return;
            }

            if (!_licenseAccepted)
            {
                var enteredKey = LicenseKeyTextBox.Text?.Trim() ?? string.Empty;
                var cleanedDigits = new string(enteredKey.Where(char.IsDigit).ToArray());
                if (cleanedDigits.Length == 8 && enteredKey.Length == 8)
                {
                    // User pasted an 8-digit PIN into the licence box: route seamlessly to PIN setup
                    ProvisionCodeRadioButton.IsChecked = true;
                    ProvisioningCodeTextBox.Text = cleanedDigits;
                    await RunWithDisabledContinueAsync(AcceptProvisionCodeStep);
                    return;
                }

                await AcceptLicenseStepAsync();
                return;
            }

            await RunWithDisabledContinueAsync(AcceptCredentialsStep);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"STARTUP ContinueButton_Click failed: {ex}");
            ErrorText.Text = $"Setup failed: {ex.Message}";
        }
    }

    private async Task AcceptProvisionCodeStep()
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
            ErrorText.Text = "Enter a valid 8-digit setup code.";
            return;
        }

        ContinueButton.Content = "Provisioning...";
        var provisioned = await _provisioningService.ProvisionAsync(
            cleanedCode,
            "MANAGED",
            "Licensed (Managed)",
            string.Empty,
            audioInput,
            audioOutput);

        if (!provisioned.Success || provisioned.Config is null)
        {
            ErrorText.Text = provisioned.Message;
            ContinueButton.Content = "Connect & Setup";
            return;
        }

        Config = provisioned.Config;
        DialogResult = true;
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

    private async Task AcceptLicenseStepAsync()
    {
        var licenseKey = LicenseKeyTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(licenseKey))
        {
            ErrorText.Text = "Enter a valid license key.";
            return;
        }

        ContinueButton.IsEnabled = false;
        ContinueButton.Content = "Checking...";
        try
        {
            var activation = await _licenseService.ActivateAsync(licenseKey);
            if (!activation.Success)
            {
                ErrorText.Text = activation.Message;
                return;
            }

            _licenseAccepted = true;
            _licenseKey = licenseKey;
            _licenseStatus = _licenseService.Status;
            _allowCustomSipEndpoint = LicenseAllowsCustomSipEndpoint(licenseKey);
            PrivatePbxPanel.Visibility = _allowCustomSipEndpoint ? Visibility.Visible : Visibility.Collapsed;
            PrivatePbxTextBox.Text = _allowCustomSipEndpoint ? AppStartupConfig.FixedSipServer : string.Empty;
            UpdateUiMode();
        }
        finally
        {
            ContinueButton.IsEnabled = true;
        }
    }

    private async Task AcceptCredentialsStep()
    {
        if (AudioInputComboBox.SelectedItem is not MediaDeviceInfo audioInput ||
            AudioOutputComboBox.SelectedItem is not MediaDeviceInfo audioOutput)
        {
            ErrorText.Text = "Select audio input and audio output devices.";
            return;
        }

        var extension = ExtensionTextBox.Text.Trim();
        var username = UsernameTextBox.Text.Trim();
        var password = PasswordBox.Password;
        var server = _allowCustomSipEndpoint ? PrivatePbxTextBox.Text.Trim() : AppStartupConfig.FixedSipServer;

        if (_allowCustomSipEndpoint && string.IsNullOrWhiteSpace(server))
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

        Config = new AppStartupConfig(
            server,
            AppStartupConfig.FixedSipPort,
            server,
            extension,
            username,
            password,
            _licenseKey,
            _licenseStatus,
            audioInput,
            audioOutput,
            LicenseLocalKey: _licenseService.LocalKey ?? string.Empty).WithFixedSipEndpoint();

        DialogResult = true;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void AuthenticationMode_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded)
        {
            return;
        }

        UpdateUiMode();
    }

    private static bool LicenseAllowsCustomSipEndpoint(string licenseKey)
    {
        return licenseKey.StartsWith("PR", StringComparison.OrdinalIgnoreCase) ||
               licenseKey.StartsWith("BUYOUT", StringComparison.OrdinalIgnoreCase);
    }
}
