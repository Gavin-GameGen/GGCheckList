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
		const items = await api.getChecklist();
		runtime.objects.JSON.getFirstInstance().setJsonDataCopy(items);
		runtime.callFunction("OnChecklistLoaded");
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
