import { create } from "zustand";

type StatusState = {
  lastRequestId?: string;
  setLastRequestId: (requestId: string) => void;
};

export const useStatusStore = create<StatusState>((set) => ({
  setLastRequestId: (requestId) => {
    set({ lastRequestId: requestId });
  },
}));
