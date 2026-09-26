// Main-process helper to read GPU status and active device information.

export interface GpuStatusResult {
  features: Record<string, string>;
  active: string[];
  angle: string;
}

export async function readGpuStatus(): Promise<GpuStatusResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as typeof import("electron");
    if (!electron?.app) {
      return { features: {}, active: [], angle: "" };
    }
    const features = ((electron.app.getGPUFeatureStatus?.() ?? {}) as unknown) as Record<string, string>;
    let active: string[] = [];
    let angle = "";
    try {
      const info = (await electron.app.getGPUInfo?.("basic")) as any;
      if (info && Array.isArray(info.gpuDevice)) {
        active = info.gpuDevice
          .filter((d: any) => d && (d.active || d.driverVendor || d.deviceString))
          .map((d: any) => String(d.deviceString || d.driverVendor || `Device 0x${(d.deviceId ?? 0).toString(16)}`))
          .filter(Boolean);
        if (active.length === 0) {
          active = info.gpuDevice
            .map((d: any) => String(d.deviceString || d.driverVendor || ""))
            .filter(Boolean);
        }
      }
      if (info?.auxAttributes?.glRenderer) {
        angle = String(info.auxAttributes.glRenderer);
      }
    } catch {
      /* ignore GPU info failure */
    }
    return { features, active, angle };
  } catch {
    return { features: {}, active: [], angle: "" };
  }
}
