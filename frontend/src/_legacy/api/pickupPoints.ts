import { apiClient } from "./client";
import type { Carrier, PickupPoint } from "../types";

type BackendCarrier = "foxpost" | "postapont";

type BackendPickupPoint = Omit<PickupPoint, "carrier"> & {
  carrier: BackendCarrier;
};

export type PickupPointParams = {
  carrier?: Carrier;
  city?: string;
  zip?: string;
  search?: string;
  limit?: number;
};

function toBackendCarrier(carrier?: Carrier): BackendCarrier | undefined {
  if (carrier === "mpl") {
    return "postapont";
  }
  return carrier;
}

function fromBackendPickupPoint(point: BackendPickupPoint): PickupPoint {
  return {
    ...point,
    carrier: point.carrier === "postapont" ? "mpl" : point.carrier,
  };
}

export async function getPickupPoints(params: PickupPointParams = {}): Promise<PickupPoint[]> {
  const endpoint = params.search ? "/api/pickup-points/search" : "/api/pickup-points";
  const response = await apiClient.get<BackendPickupPoint[]>(endpoint, {
    params: {
      carrier: toBackendCarrier(params.carrier),
      city: params.city || undefined,
      zip: params.zip || undefined,
      q: params.search || undefined,
      limit: params.limit ?? 30,
    },
  });
  return response.data.map(fromBackendPickupPoint);
}

export async function getPickupPoint(id: number): Promise<PickupPoint> {
  const response = await apiClient.get<BackendPickupPoint>(`/api/pickup-points/${id}`);
  return fromBackendPickupPoint(response.data);
}
