const koffi = {
  load: () => {
    throw new Error("koffi is unavailable in SEA builds");
  },
};

export default koffi;
