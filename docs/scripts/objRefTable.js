const C3 = self.C3;
self.C3_GetObjectRefTable = function () {
	return [
		C3.Plugins.Sprite,
		C3.Plugins.Text,
		C3.Plugins.Json,
		C3.Plugins.Touch,
		C3.Plugins.Sprite.Acts.Destroy,
		C3.Plugins.Text.Acts.Destroy,
		C3.Plugins.Json.Cnds.ForEach,
		C3.Plugins.System.Acts.CreateObject,
		C3.Plugins.Sprite.Acts.SetInstanceVar,
		C3.Plugins.Json.Exps.Get,
		C3.Plugins.Sprite.Acts.SetAnimFrame,
		C3.Plugins.Text.Acts.SetInstanceVar,
		C3.Plugins.Text.Acts.SetText,
		C3.Plugins.System.Acts.AddVar,
		C3.JavaScriptInEvents.Corelogic_Event4,
		C3.Plugins.Sprite.Cnds.CompareInstanceVar,
		C3.Plugins.System.Cnds.Compare,
		C3.Plugins.System.Cnds.OnLayoutStart,
		C3.JavaScriptInEvents.Frontend_Event2,
		C3.Plugins.Touch.Cnds.OnTapGestureObject
	];
};
self.C3_JsPropNameTable = [
	{itemId: 0},
	{done: 0},
	{saving: 0},
	{Button: 0},
	{ButtonText: 0},
	{JSON: 0},
	{Touch: 0},
	{row: 0},
	{ok: 0}
];

self.InstanceType = {
	Button: class extends self.ISpriteInstance {},
	ButtonText: class extends self.ITextInstance {},
	JSON: class extends self.IJSONInstance {},
	Touch: class extends self.IInstance {}
}