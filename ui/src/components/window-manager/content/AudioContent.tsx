/**
 * AudioContent — Window content adapter for audio files.
 */

import type { WindowState } from "../../../contexts/WindowManagerContext";
import { buildFileUrl } from "../../file-manager/types";
import { AudioPlayer } from "../AudioPlayer";
import { buildSshFileUrl } from "../file-url";

export default function AudioContent({ win }: { win: WindowState }) {
  const filePath = win.metadata.filePath ?? "";
  const fileName = win.metadata.fileName ?? win.title;
  const fileSystemId = win.metadata.fileSystemId ?? "";

  const audioSrc =
    buildFileUrl(filePath, fileSystemId) ??
    buildSshFileUrl(win.metadata.sshTerminalId, filePath);

  return audioSrc ? <AudioPlayer src={audioSrc} fileName={fileName} /> : null;
}
