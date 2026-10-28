export interface HandsetAccountConfig {
  extension: string;
  username: string;
  password: string;
  displayName: string;
  sipServer: string;
  sipPort: number;
  sipTransport: string;
  dataHandlerUrl: string;
  blfKeys?: Array<{ key: number; extension: string; label: string }>;
}

export function generateYealinkConfig(cfg: HandsetAccountConfig): string {
  const transportCode = cfg.sipTransport.toUpperCase() === 'TLS' ? '2' : cfg.sipTransport.toUpperCase() === 'TCP' ? '1' : '0';
  
  let lines = [
    `#!version:1.0.0.1`,
    `# ==============================================================================`,
    `# CKM Handler Auto-Generated Yealink Provisioning Profile`,
    `# Handset Extension: ${cfg.extension} (${cfg.displayName})`,
    `# Generated at: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    ``,
    `## SIP Account 1 Configuration`,
    `account.1.enable = 1`,
    `account.1.label = ${cfg.displayName}`,
    `account.1.display_name = ${cfg.displayName}`,
    `account.1.auth_name = ${cfg.username}`,
    `account.1.user_name = ${cfg.extension}`,
    `account.1.password = ${cfg.password}`,
    `account.1.sip_server.1.address = ${cfg.sipServer}`,
    `account.1.sip_server.1.port = ${cfg.sipPort}`,
    `account.1.sip_server.1.transport_type = ${transportCode}`,
    `account.1.sip_server.1.expires = 3600`,
    `account.1.nat.nat_traversal = 1`,
    `account.1.codec.pcmu.enable = 1`,
    `account.1.codec.pcma.enable = 1`,
    `account.1.codec.g722.enable = 1`,
    `account.1.codec.opus.enable = 1`,
    ``,
    `## Central Corporate Directory & Phonebook`,
    `remote_phonebook.data.1.url = ${cfg.dataHandlerUrl}/phonebook/yealink.xml`,
    `remote_phonebook.data.1.name = Company Directory`,
    ``,
    `## Firmware & Auto-Provisioning Server`,
    `auto_provision.server.url = ${cfg.dataHandlerUrl}/provision`,
    `auto_provision.power_on = 1`,
    `auto_provision.weekly.enable = 1`,
    ``
  ];

  // Optional BLF / Line keys
  if (cfg.blfKeys && cfg.blfKeys.length > 0) {
    lines.push(`## Programmable Memory / BLF Keys`);
    for (const blf of cfg.blfKeys) {
      lines.push(`linekey.${blf.key}.type = 16`); // 16 = BLF in Yealink
      lines.push(`linekey.${blf.key}.line = 1`);
      lines.push(`linekey.${blf.key}.value = ${blf.extension}`);
      lines.push(`linekey.${blf.key}.label = ${blf.label}`);
    }
  }

  return lines.join('\r\n');
}
