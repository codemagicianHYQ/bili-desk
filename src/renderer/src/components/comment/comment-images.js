export async function imageFilesToPayload(files) {
    return Promise.all(files.map(async (file) => ({
        name: file.name || "image.jpg",
        mime: file.type || "image/jpeg",
        data: new Uint8Array(await file.arrayBuffer()),
    })));
}
