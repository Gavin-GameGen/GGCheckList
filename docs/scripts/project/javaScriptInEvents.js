// importsForEvents.js
import { api } from "./data.js";

const scriptsInEvents = {

	async Corelogic_Event4(runtime, localVars)
	{
		const itemId = localVars.itemId;
		const done = localVars.done;
		try {
		  await api.setDone(itemId, done === 1);
		  runtime.callFunction("SaveFinished", itemId, 1);
		} catch (err) {
		  console.error("Save failed:", err);
		  runtime.callFunction("SaveFinished", itemId, 0);
		}
	},

	async Frontend_Event2(runtime, localVars)
	{
		try {
		  await api.signIn();  // goes to Discord if not signed in
		  const profile = await api.getProfile();
		  if (!profile || profile.role === "pending") {
		    console.warn("Signed in, waiting for approval:", profile?.display_name);
		    return;
		  }
		  if (profile.role !== "student") {
		    console.log("Mentor/admin signed in; mentor screen not built yet.");
		    return;
		  }
		  const items = await api.getChecklist();
		  runtime.objects.JSON.getFirstInstance().setJsonDataCopy(items);
		  runtime.callFunction("OnChecklistLoaded");
		} catch (err) {
		  console.error("Could not load checklist:", err);
		}
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
