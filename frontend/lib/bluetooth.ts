// Web Bluetooth (BLE) wrapper.
//
// All `navigator.bluetooth` calls live here so React/store code stays clean.
// The browser connects DIRECTLY to the ESP32 over BLE — the backend is not in
// the radio path. Web Bluetooth only works in Chrome/Edge/Opera on desktop and
// Android, requires a secure context (https or http://localhost), and a connect
// must be triggered by a user gesture (a click).

// These UUIDs MUST match firmware/attune_ble/attune_ble.ino.
export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const STATUS_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

export interface BleConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
}

/** True when the current browser exposes the Web Bluetooth API. */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * Open the browser's BLE device picker, connect to the chosen Attune device,
 * and start listening for the status characteristic's notifications.
 *
 * @param onDisconnect called when the link drops (device powered off / out of
 *        range). This is how we detect disconnections.
 * @throws if Web Bluetooth is unsupported, the user cancels the picker, or the
 *         GATT connection fails. Callers should catch and surface this.
 */
export async function connectToDevice(onDisconnect: () => void): Promise<BleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }

  // Must be called from within a user-gesture handler (e.g. onClick).
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
  });

  // Fired on any disconnect, including ones we didn't initiate.
  device.addEventListener('gattserverdisconnected', onDisconnect);

  if (!device.gatt) {
    throw new Error('Selected device does not expose a GATT server.');
  }

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const statusChar = await service.getCharacteristic(STATUS_CHAR_UUID);

  // Subscribe to the heartbeat so the link is observably live (and ready for
  // real data later). Failure here shouldn't fail the whole connection.
  try {
    await statusChar.startNotifications();
  } catch {
    // notifications are best-effort for a status-only build
  }

  return { device, server };
}

/** Cleanly tear down a connection. Safe to call if already disconnected. */
export function disconnectDevice(connection: BleConnection | null): void {
  if (connection?.device.gatt?.connected) {
    connection.device.gatt.disconnect();
  }
}
