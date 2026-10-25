//The settings' controls (docs/ui/components/Toggle, Slider) and the text field (SaveLoad's cloud
//save id). Styled by src/view/controls.css.

type ToggleProps = {
	checked: boolean,
	onChange: (checked: boolean) => void,
	//its name for screen readers; or an id, which a <label for> on the setting's row points at,
	//so a click on the row's label toggles it too
	label?: string,
	id?: string,
	disabled?: boolean,
};

//A switch: the track carries ON or OFF in type, so its state never depends on colour. No handler
//when disabled: jsdom still fires a click on a disabled button
export function Toggle({ checked, onChange, label, id, disabled }: ToggleProps) {
	return (
		<button id={id} type="button" class="pm-toggle" role="switch" aria-checked={checked} aria-label={label}
			disabled={disabled} onClick={disabled ? undefined : () => onChange(!checked)}>
			<span class="track" />
		</button>
	);
}

type SliderProps = {
	label: string,
	min: number,
	max: number,
	step: number,
	value: number,
	//the value as text, repeated to the right of the track: "1.0×", "1366 px"
	text: string,
	onInput: (value: number) => void,
};

//A native range input: the brass fill runs up to the value (--val; Firefox draws its own progress)
export function Slider({ label, min, max, step, value, text, onInput }: SliderProps) {
	const fill = { "--val": `${(value - min) / (max - min) * 100}%` };
	return (
		<>
			<input class="pm-range" type="range" min={min} max={max} step={step} value={value} style={fill}
				aria-label={label} aria-valuetext={text} onInput={(e) => onInput(Number(e.currentTarget.value))} />
			<span class="val" aria-hidden="true">{text}</span>
		</>
	);
}

type InputProps = {
	label: string,
	value: string,
	onInput: (value: string) => void,
	placeholder?: string,
	//the value can't be used (a cloud id that loads nothing): a critical edge, and aria-invalid
	invalid?: boolean,
	id?: string,
};

export function Input({ label, value, onInput, placeholder, invalid, id }: InputProps) {
	return (
		<input id={id} class="pm-input" type="text" value={value} placeholder={placeholder}
			aria-label={label} aria-invalid={invalid} onInput={(e) => onInput(e.currentTarget.value)} />
	);
}
