import { Modal, Spin } from "@tokimo/ui";
import { lazy, Suspense } from "react";

const MusicSettingsPage = lazy(
  () => import("@/apps/settings/admin/MusicSettingsPage"),
);

interface MusicSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function MusicSettingsModal({
  open,
  onClose,
}: MusicSettingsModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="TokimoMusic 设置"
      footer={null}
      width={960}
      destroyOnClose
      styles={{ body: { padding: 0 } }}
    >
      <div className="h-[640px]">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spin />
            </div>
          }
        >
          <MusicSettingsPage />
        </Suspense>
      </div>
    </Modal>
  );
}
