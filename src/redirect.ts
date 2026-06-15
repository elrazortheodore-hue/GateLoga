let targetDatabase: string = import.meta.env.VITE_DATABASE_URL;

// Parse target URL if wrapped in an iframe tag
if (targetDatabase && targetDatabase.includes('<iframe')) {
  const match = targetDatabase.match(/src=["'](.*?)["']/);
  if (match && match[1]) {
    targetDatabase = match[1];
  }
}

window.onload = () => {
  setTimeout(() => {
    window.location.replace(targetDatabase || "https://docs.google.com");
  }, 800);
};
export {};
