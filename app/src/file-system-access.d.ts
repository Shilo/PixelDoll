// The parts of the File System Access API that project folder publishing uses (Chromium only; TypeScript's DOM library
// omits them). Every caller checks that they exist before use.

interface FileSystemHandlePermissionDescriptor {
	mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
	queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
	requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
	id?: string;
	mode?: 'read' | 'readwrite';
	startIn?:
		FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

declare function showDirectoryPicker(
	options?: DirectoryPickerOptions
): Promise<FileSystemDirectoryHandle>;
