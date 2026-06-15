const targetDatabase: string = import.meta.env.VITE_DATABASE_URL;

window.onload = () => {
  setTimeout(() => {
    window.location.replace(targetDatabase || "https://docs.google.com");
  }, 800);
};
export {};
