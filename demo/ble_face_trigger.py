#!/usr/bin/env python3
import argparse
import asyncio
import sys

from bleak import BleakClient, BleakScanner

NUS_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"


async def trigger(device_name: str, scan_timeout: float) -> None:
    print(f"[1/3] BLE scan: {device_name}")

    def matches(device, advertisement) -> bool:
        name = advertisement.local_name or device.name or ""
        return name.upper() == device_name.upper()

    device = await BleakScanner.find_device_by_filter(matches, timeout=scan_timeout)
    if device is None:
        raise RuntimeError(f"{device_name} 광고를 찾지 못했습니다")

    print(f"[2/3] BLE connect: {device.name or device_name}")
    received = asyncio.Event()
    line_buffer = bytearray()

    def on_notify(_characteristic, data: bytearray) -> None:
        line_buffer.extend(data)
        while b"\n" in line_buffer:
            raw, _, remaining = line_buffer.partition(b"\n")
            line_buffer[:] = remaining
            line = raw.rstrip(b"\r").decode("ascii", errors="replace")
            if line:
                print(f"  notify: {line}")
            if line == "BTN:A:DOWN":
                received.set()

    async with BleakClient(device, timeout=scan_timeout) as client:
        await client.start_notify(NUS_TX_UUID, on_notify)
        await asyncio.sleep(0.2)
        print("[3/3] NUS write: FACE")
        await client.write_gatt_char(NUS_RX_UUID, b"FACE\n", response=False)
        await asyncio.wait_for(received.wait(), timeout=3.0)
        await client.stop_notify(NUS_TX_UUID)

    print("OK: NU40이 BTN:A:DOWN을 중계했습니다")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="NU40에 BLE FACE 명령을 보내 SleepPal 얼굴을 여는 촬영용 트리거"
    )
    parser.add_argument("--name", default="SLEEPPAL-PILLOW-01", help="NU40 BLE 광고 이름")
    parser.add_argument("--timeout", type=float, default=12.0, help="scan/connect 제한 시간(초)")
    args = parser.parse_args()

    try:
        asyncio.run(trigger(args.name, args.timeout))
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
