<script lang="ts" module>
	class ConfirmDeleteDialogState {
		open = $state(false);
		inputText = $state('');
		options = $state<ConfirmDeleteOptions | null>(null);
		loading = $state(false);

		constructor() {
			this.confirm = this.confirm.bind(this);
			this.cancel = this.cancel.bind(this);
		}

		newConfirmation(options: ConfirmDeleteOptions) {
			this.reset();
			this.options = options;
			this.open = true;
		}

		reset() {
			this.open = false;
			this.inputText = '';
			this.options = null;
		}

		confirm() {
			if (this.options?.input) {
				if (this.inputText !== this.options.input.confirmationText) {
					return;
				}
			}

			this.loading = true;
			this.options
				?.onConfirm()
				.then(() => {
					this.open = false;
				})
				.finally(() => {
					this.loading = false;
				});
		}

		cancel() {
			this.options?.onCancel?.();
			this.open = false;
		}
	}

	const dialogState = new ConfirmDeleteDialogState();

	export type ConfirmDeleteOptions = {
		title: string;
		description: string;
		skipConfirmation?: boolean;
		input?: {
			confirmationText: string;
		};
		confirm?: {
			text?: string;
		};
		cancel?: {
			text?: string;
		};
		onConfirm: () => Promise<unknown>;
		onCancel?: () => void;
	};

	export function confirmDelete(options: ConfirmDeleteOptions) {
		if (options.skipConfirmation) {
			options.onConfirm();
			return;
		}

		dialogState.newConfirmation(options);
	}
</script>

<script lang="ts">
	import * as Modal from '$lib/components/ui/modal';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { LoadingButton } from '$lib/components/ui/loading-button';
</script>

<!-- a dialog on desktop and a drawer on phones, like every other dialog -->
<Modal.Root bind:open={dialogState.open}>
	<Modal.Content showCloseButton={false} class="sm:max-w-md">
		<form
			method="POST"
			onsubmit={(e) => {
				e.preventDefault();
				dialogState.confirm();
			}}
			class="flex flex-col gap-4"
		>
			<Modal.Header>
				<Modal.Title>
					{dialogState.options?.title}
				</Modal.Title>
				<Modal.Description>
					{dialogState.options?.description}
				</Modal.Description>
			</Modal.Header>
			{#if dialogState.options?.input}
				<Input
					bind:value={dialogState.inputText}
					placeholder={`Enter "${dialogState.options.input.confirmationText}" to confirm.`}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							// for some reason without this the form will submit and the dialog will close immediately
							e.preventDefault();
							dialogState.confirm();
						}
					}}
				/>
			{/if}
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={dialogState.cancel}>
					{dialogState.options?.cancel?.text ?? 'Cancel'}
				</Button>
				<LoadingButton
					type="submit"
					variant="destructive"
					loading={dialogState.loading}
					disabled={dialogState.options?.input &&
						dialogState.inputText !== dialogState.options.input.confirmationText}
				>
					{dialogState.options?.confirm?.text ?? 'Delete'}
				</LoadingButton>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
