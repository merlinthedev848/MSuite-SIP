import { HandsetAccountConfig } from './yealink';

export function generateFanvilConfig(cfg: HandsetAccountConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo>
  <Version>2.0.0</Version>
  <SIP>
    <Line index="1">
      <Enable>1</Enable>
      <Name>${cfg.displayName}</Name>
      <Username>${cfg.extension}</Username>
      <AuthName>${cfg.username}</AuthName>
      <Password>${cfg.password}</Password>
      <ServerAddr>${cfg.sipServer}</ServerAddr>
      <ServerPort>${cfg.sipPort}</ServerPort>
      <Transport>${cfg.sipTransport.toUpperCase()}</Transport>
      <RegisterExpire>3600</RegisterExpire>
    </Line>
  </SIP>
  <PhoneBook>
    <CloudPhoneBook>
      <Item index="1">
        <Title>Company Directory</Title>
        <ServerUrl>${cfg.dataHandlerUrl}/phonebook/fanvil.xml</ServerUrl>
      </Item>
    </CloudPhoneBook>
  </PhoneBook>
  <AutoProvision>
    <ServerUrl>${cfg.dataHandlerUrl}/provision</ServerUrl>
    <Mode>PowerOn</Mode>
  </AutoProvision>
</DeviceInfo>`;
}
