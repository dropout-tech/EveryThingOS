import { WorkspaceRecords } from '@/components/WorkspaceRecords';
import { ModuleFrame } from '@/components/ModuleFrame';
export default function Page() { return <ModuleFrame kicker="文件" title="文件"><WorkspaceRecords kind="documents" /></ModuleFrame>; }
