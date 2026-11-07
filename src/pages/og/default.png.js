// SPDX-License-Identifier: Apache-2.0
import { ogResponse } from '../../lib/og.mjs';
import { PROJECT } from '../../lib/site.mjs';

export const GET = () => ogResponse({ kicker: PROJECT.name, title: 'Open, tested code for the rhythms of life' });
