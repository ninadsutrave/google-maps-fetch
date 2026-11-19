import type { CallOptions, Send } from './http'
import type { ValidateAddressRequest, ValidateAddressResponse, ValidationConclusion } from './types'

const base = 'https://addressvalidation.googleapis.com/v1'

export function createAddressValidation(send: Send) {
  /** Checks an address, corrects and completes it where it can, and says how confident it is */
  const validate = (request: ValidateAddressRequest, call?: CallOptions) =>
    send<ValidateAddressResponse>({ method: 'POST', url: `${base}:validateAddress`, body: request }, call)

  /** Tells Google which version of the address was used in the end, for a responseId from validate() */
  const feedback = async ({ responseId, conclusion }: { responseId: string; conclusion: ValidationConclusion }, call?: CallOptions) => {
    await send({ method: 'POST', url: `${base}:provideValidationFeedback`, body: { responseId, conclusion } }, call)
  }

  return { validate, feedback }
}
